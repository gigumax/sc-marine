/* ============================================================
   net.js — online co-op via Cloud Firestore
   Lobby: sessions of 2–5 players; overflow rolls to next session.
   Host-authoritative: first member simulates the swarm and
   broadcasts snapshots; clients render replicas + send events.

   Firestore layout per room (rooms/sc-marine-N):
     members/{id} — presence via 5 s heartbeat (no onDisconnect in
                    Firestore — docs older than STALE_MS are swept)
     state/{id}   — latest player transform (10 Hz overwrite)
     meta/snap    — host world snapshot (5 Hz overwrite)
     ev/{pushId}  — discrete events; host prunes > 15 s old

   NOTE: Firestore bills per read/write — rates below are tuned
   down vs a websocket backend. Fine for a private game on Spark.
   ============================================================ */

const FB_CFG = {
  apiKey: 'AIzaSyAiqHqRVzxoOTtX-EPNaxeYXzrrI_L3vSU',
  authDomain: 'starcraft-marine.firebaseapp.com',
  projectId: 'starcraft-marine',
  storageBucket: 'starcraft-marine.firebasestorage.app',
  messagingSenderId: '378764253130',
  appId: '1:378764253130:web:68d91f0ce7b162f7efe133',
};
const NET_MIN = 2, NET_MAX = 5, NET_SESS = 10;
const STALE_MS = 15000, HB_MS = 5000;      // presence: heartbeat / ghost window
const ACCENTS = ['#4ad0ff', '#6aff8a', '#ff6a4a', '#c07aff', '#ffd24a'];

const Net = {
  on: false, isHost: false, hostId: null,
  id: 'p' + Math.random().toString(36).slice(2, 10),
  name: 'MARINE-' + Math.random().toString(36).slice(2, 5).toUpperCase(),
  accent: ACCENTS[Math.floor(Math.random() * ACCENTS.length)],
  session: -1, members: {}, peers: {},
  eById: {}, pkById: {}, spitFx: [], misFx: [],
  chan: null, db: null, aborted: false,
  roomRef: null, membersRef: null, myRef: null,
  evRef: null, stateRef: null, snapRef: null,
  unsubs: [], hbT: null,
  sendT: 0, snapT: 0, pruneT: 0, countT: -1,
  started: false, dead: false,
  nextEid: 1, nextPk: 1, lastSnap: null,
  off: 0, joinAt: 0,

  /* ---------- lobby ---------- */
  lobby(msg) {
    const el = document.getElementById('lobby-status');
    if (el) el.textContent = msg;
  },
  lobbyList() {
    const el = document.getElementById('lobby-players');
    if (!el) return;
    el.innerHTML = Object.values(this.members)
      .map(m => `<div style="color:${m.accent}">▸ ${m.name}${m.id === this.id ? ' (you)' : ''}</div>`)
      .join('') || '<div>—</div>';
  },

  /* Firestore has no serverTimeOffset — probe it with a real write+read */
  serverNow() { return Date.now() + this.off; },
  async calibrateClock() {
    try {
      const probe = this.db.collection('_clock').doc(this.id);
      await probe.set({ t: firebase.firestore.FieldValue.serverTimestamp() });
      const snap = await probe.get();
      const t = snap.data() && snap.data().t;
      this.off = t ? t.toMillis() - Date.now() : 0;
      probe.delete().catch(() => {});
    } catch (_) { this.off = 0; }
  },

  async join() {
    if (FB_CFG.apiKey.startsWith('PASTE')) { this.lobby('NEEDS API KEY — see README'); return; }
    if (!window.firebase || !firebase.firestore) { this.lobby('UPLINK LIBRARY MISSING'); return; }
    this.aborted = false;
    this.lobby('CONTACTING UPLINK…');
    if (!firebase.apps.length) firebase.initializeApp(FB_CFG);
    this.db = firebase.firestore();
    await this.calibrateClock();
    this.joinAt = this.serverNow() - 500;
    for (let s = 0; s < NET_SESS; s++) {
      if (this.aborted) return;
      if (await this.trySession(s)) return;
    }
    if (!this.aborted) this.lobby('ALL SESSIONS FULL — try again soon');
  },

  /* leave the lobby cleanly — aborts any in-flight join, drops the room */
  bail() {
    this.aborted = true;
    this.leaveRoom();
    this.on = false; this.isHost = false; this.started = false;
    this.members = {}; this.peers = {};
    this.countT = -1; this.session = -1;
    const lb = document.getElementById('lobbyscreen');
    if (lb) lb.classList.add('hidden');
  },

  /* detach listeners + remove my presence; wipe the room if I'm last out */
  leaveRoom() {
    const lastMan = this.roomRef && Object.keys(this.members).length <= 1;
    clearInterval(this.hbT); this.hbT = null;
    this.unsubs.forEach(u => { try { u(); } catch (_) {} });
    this.unsubs = [];
    if (this.myRef) { try { this.myRef.delete(); } catch (_) {} }
    if (this.stateRef) { try { this.stateRef.doc(this.id).delete(); } catch (_) {} }
    if (lastMan) {
      // dead rooms would otherwise linger with stale docs
      ['members', 'state', 'ev', 'meta'].forEach(col =>
        this.roomRef.collection(col).get()
          .then(q => q.forEach(d => d.ref.delete()))
          .catch(() => {}));
      try { this.roomRef.delete(); } catch (_) {}
    }
    this.roomRef = this.membersRef = this.myRef = null;
    this.evRef = this.stateRef = this.snapRef = null;
    this.chan = null;
  },

  /* member doc counts as present if its heartbeat is fresh;
     null t = own pending write (serverTimestamp not yet resolved) */
  fresh(m) { return !m.t || this.serverNow() - m.t.toMillis() < STALE_MS; },

  trySession(s) {
    return new Promise(resolve => {
      const room = this.db.collection('rooms').doc('sc-marine-' + s);
      const membersRef = room.collection('members');
      const myRef = membersRef.doc(this.id);
      let done = false, unsub = null;
      const finish = ok => { if (!done) { done = true; resolve(ok); } };
      const leave = () => {
        try { if (unsub) unsub(); } catch (_) {}
        try { myRef.delete(); } catch (_) {}
      };

      const onMem = qs => {
        const st = {};
        qs.forEach(d => st[d.id] = d.data());
        const mem = {};
        for (const k of Object.keys(st)) if (this.fresh(st[k])) mem[k] = st[k];
        const meGone = !mem[this.id];
        // sweep ghosts — stale docs from crashed/closed tabs
        for (const k of Object.keys(st))
          if (k !== this.id && !this.fresh(st[k])) membersRef.doc(k).delete().catch(() => {});
        this.members = mem;
        this.lobbyList();
        // drop avatar meshes of players who left mid-match
        for (const id in this.peers)
          if (!mem[id]) { Enemies.scene.remove(this.peers[id].mesh); delete this.peers[id]; buildSquadHud(); }
        // host migration: smallest remaining id takes over the sim
        if (this.started && this.on && !mem[this.hostId]) {
          const ids = Object.keys(mem).sort();
          this.hostId = ids[0];
          if (this.hostId === this.id && !this.isHost) {
            this.isHost = true;
            UI.waveBanner('FIELD COMMAND TRANSFERRED — YOU LEAD');
          }
        }
        if (done) {
          // mid-lobby arrivals fill the room
          const n = Object.keys(mem).length;
          if (!this.started && n >= NET_MIN) this.maybeStart();
          if (!this.started) this.lobby(n >= NET_MIN ? 'SQUAD READY' : `WAITING — ${n}/${NET_MIN} MARINES`);
          if (meGone) return;
          if (!this.started && Object.values(mem).some(m => m.inMatch)) this.rollOver(s);
          return;
        }
        // first sync: decide if we stay
        if (this.aborted) { leave(); finish(false); return; }
        const n = Object.keys(mem).length;
        const full = n > NET_MAX;
        const running = Object.values(mem).some(m => m.inMatch && m.id !== this.id);
        if (full || running) { leave(); finish(false); return; }
        this.roomRef = room; this.membersRef = membersRef; this.myRef = myRef;
        this.chan = room;
        this.unsubs.push(unsub);
        this.attachStreams();
        finish(true);
      };

      // presence: write + heartbeat so survivors can sweep us if we vanish
      const beat = () => myRef.set({
        id: this.id, name: this.name, accent: this.accent,
        inMatch: !!this.started,
        t: firebase.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
      beat();
      unsub = membersRef.onSnapshot(onMem, () => finish(false));
      setTimeout(() => { if (!done) { leave(); finish(false); } }, 4000);
    });
  },

  /* live data streams — attached once we've claimed a room seat */
  attachStreams() {
    const room = this.roomRef;
    // presence heartbeat keeps us fresh + drives inMatch flag
    this.hbT = setInterval(() => {
      if (this.myRef) this.myRef.set({
        id: this.id, name: this.name, accent: this.accent,
        inMatch: !!this.started,
        t: firebase.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
    }, HB_MS);
    window.addEventListener('beforeunload', this._unload = () => {
      try { this.myRef && this.myRef.delete(); } catch (_) {}
      try { this.stateRef && this.stateRef.doc(this.id).delete(); } catch (_) {}
    });

    // discrete events — docChanges('added'), server-stamped, own writes skipped
    this.evRef = room.collection('ev');
    this.unsubs.push(this.evRef.onSnapshot(qs => {
      qs.docChanges().forEach(ch => {
        if (ch.type !== 'added') return;
        const m = ch.doc.data();
        if (!m || m.from === this.id) return;
        if (m.t && m.t.toMillis() < this.joinAt) return;
        const p = m.p || {};
        switch (m.e) {
          case 'start':   if (!this.started) this.begin(); break;
          case 'edmg':    if (this.isHost) this.hostEnemyHit(p); break;
          case 'sdmg':    if (this.isHost) this.hostHiveHit(p); break;
          case 'pdmg':    if (p.to === this.id && !Player.dead) damagePlayer(p.dmg, new THREE.Vector3(p.fx, 1, p.fz)); break;
          case 'pheal':   if (p.to === this.id && !Player.dead) Player.heal(p.amt || 6); break;
          case 'ekill':   this.onEnemyKill(p); break;
          case 'pk':      if (this.isHost) this.hostPickup(p); break;
          case 'spit':    if (!this.isHost) this.fxSpit(p); break;
          case 'shot':    this.onShot(p); break;
          case 'comm':    Audio2.radio(); squadChat(p.n, p.t, p.c); break;
          case 'win':     if (Game.running) Game.victory(); break;
          case 'restart': if (!Game.running) startGame(); break;
          // 'hiveDown' needs no handler — snap.h carries hive hp
        }
      });
    }));

    // player transforms — overwrite-per-client beats event spam
    this.stateRef = room.collection('state');
    this.unsubs.push(this.stateRef.onSnapshot(qs => {
      qs.forEach(d => {
        // state docs without a live member are ghost residue
        if (d.id !== this.id && this.members[d.id] === undefined && Object.keys(this.members).length)
          d.ref.delete().catch(() => {});
        this.onState(d.data());
      });
    }));

    // host world snapshot — single doc, overwritten
    this.snapRef = room.collection('meta').doc('snap');
    this.unsubs.push(this.snapRef.onSnapshot(d => {
      if (!this.isHost && d.exists) this.lastSnap = d.data();
    }));
  },

  rollOver(s) {
    // current session went live without us — hop to the next one
    this.leaveRoom();
    this.session = -1; this.started = false;
    if (s + 1 < NET_SESS)
      this.trySession(s + 1).then(ok => { if (!ok) this.lobby('NO OPEN SESSIONS'); });
    else this.lobby('NO OPEN SESSIONS');
  },

  async markInMatch() {
    if (this.myRef) await this.myRef.update({ inMatch: true }).catch(() => {});
  },

  maybeStart() {
    // deterministic host = smallest id present
    const ids = Object.keys(this.members).sort();
    this.hostId = ids[0];
    if (ids[0] !== this.id) return;
    if (this.countT >= 0) return;
    this.countT = 3;
    this.lobby('DROP IN 3…');
  },

  send(ev, payload) {
    if (this.evRef) this.evRef.add({
      e: ev, p: payload, from: this.id,
      t: firebase.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});
  },

  begin() {
    if (this.started) return;
    this.started = true; this.on = true;
    this.markInMatch();
    const ids = Object.keys(this.members).sort();
    this.hostId = ids[0];
    this.isHost = this.hostId === this.id;
    // spawn order → spread drop positions around origin
    const slot = ids.indexOf(this.id);
    const a = slot / Math.max(1, ids.length) * Math.PI * 2;
    Player.pos.set(Math.sin(a) * 3, 0, Math.cos(a) * 3);
    startGame();
    document.getElementById('mode-tag').classList.remove('hidden');
    UI.waveBanner(this.isHost ? 'SQUAD LINKED — YOU HAVE FIELD COMMAND' : 'SQUAD LINKED — FOLLOW YOUR LEAD');
  },

  /* ---------- remote marines ---------- */
  onState(st) {
    if (st.id === this.id || !this.on) return;
    let p = this.peers[st.id];
    const nu = st.u || 'marine';
    if (p && p.unit !== nu) {
      // promotion mid-match — swap the avatar to the new frame
      const mesh = nu === 'marauder' ? buildMarauderMesh(st.c) : buildMarineMesh(st.c);
      mesh.userData.peerId = st.id;               // medic beam can heal this marine
      const tag = makeNameTag(st.n, st.c);
      tag.position.y = nu === 'marauder' ? 2.5 : 2.15;
      mesh.add(tag);
      mesh.position.copy(p.mesh.position);
      mesh.rotation.y = p.yaw;
      Enemies.scene.remove(p.mesh);
      Enemies.scene.add(mesh);
      p.mesh = mesh; p.unit = nu; p.maxHp = nu === 'marauder' ? 300 : 100;
    }
    if (!p) {
      const mesh = st.u === 'marauder' ? buildMarauderMesh(st.c) : buildMarineMesh(st.c);
      mesh.userData.peerId = st.id;
      const tag = makeNameTag(st.n, st.c);
      tag.position.y = st.u === 'marauder' ? 2.5 : 2.15;
      mesh.add(tag);
      Enemies.scene.add(mesh);
      p = this.peers[st.id] = {
        mesh, name: st.n, accent: st.c, unit: nu,
        maxHp: nu === 'marauder' ? 300 : 100,
        to: new THREE.Vector3(st.x, st.y, st.z), hp: 100,
      };
      buildSquadHud();
    }
    p.to.set(st.x, st.y, st.z);
    p.yaw = st.yaw; p.pitch = st.pitch; p.hp = st.hp; p.dead = !!st.dead;
  },

  tickPeers(dt) {
    for (const id in this.peers) {
      const p = this.peers[id], m = p.mesh;
      if (p.dead) { if (m.visible) { m.visible = false; gibBurst(m.position.clone().setY(0.8), false); } continue; }
      if (!m.visible) m.visible = true;
      m.position.lerp(p.to, Math.min(1, dt * 12));
      m.rotation.y = p.yaw;
      setMarineScratches(m, p.hp / p.maxHp);
    }
  },

  onShot(s) {
    const p = this.peers[s.id];
    if (!p) return;
    const fl = p.mesh.userData.flash;
    if (fl) { fl.material.opacity = 1; fl.material.rotation = Math.random() * 7; }
    Audio2.shotAt ? Audio2.shotAt(p.mesh.position.distanceTo(Player.pos)) : Audio2.shot();
    const o = new THREE.Vector3(s.ox, s.oy, s.oz), e = new THREE.Vector3(s.tx, s.ty, s.tz);
    if (s.mis) this.fxMissile(o, e);
    else tracerFx(o, e, s.heal);
  },

  // remote marauder rocket — visual only, damage is host-routed
  fxMissile(o, e) {
    const m = missileMesh();
    m.position.copy(o);
    const dir = e.clone().sub(o), dist = dir.length();
    dir.normalize();
    if (dist > 0.01) m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    Enemies.scene.add(m);
    this.misFx.push({ m, dir, dist, flown: 0, smokeT: 0 });
  },

  /* ---------- host sim helpers ---------- */
  targets() {
    // every living marine on the field, local first
    const t = [{ pos: Player.pos, id: this.id, dead: Player.dead }];
    for (const k in this.peers) t.push({ pos: this.peers[k].mesh.position, id: k, dead: this.peers[k].dead });
    return t.filter(x => !x.dead);
  },

  hostEnemyHit(m) {
    const e = this.eById[m.id];
    if (e && !e.dead) damageEnemy(e, m.dmg, m.head, false, m.by);
  },
  hostHiveHit(m) {
    const s = World.spawners[m.i];
    if (s && !s.dead) damageSpawner(s, m.dmg, new THREE.Vector3(m.x, 0, m.z));
  },
  hostPickup(m) {
    const p = this.pkById[m.id];
    if (p && !p.done) { p.done = true; Enemies.scene.remove(p.m); }
  },

  onEnemyKill(m) {
    // authoritative kill — everyone gibs; shooter gets credit (lings/hunters only)
    const e = this.eById[m.id];
    if (e && !e.goneFx) { e.goneFx = true; gibBurst(new THREE.Vector3(m.x, 0.4, m.z), e.hunter); }
    Enemies.kills = m.k;
    if (m.by === this.id && (!e || !e.roach)) {
      Player.kills++;
      UI.hitmarker(true);
      if (!Game.leader && Player.kills >= PROMOTE_KILLS) promoteToLeader();
    }
  },

  fxSpit(s) {
    const m = new THREE.Mesh(_spitGeo, _spitMat);
    m.position.set(s.x, s.y, s.z);
    Enemies.scene.add(m);
    this.spitFx.push({ m, vel: new THREE.Vector3(s.vx, s.vy, s.vz), t: 0 });
    Audio2.spit(m.position.distanceTo(Player.pos));
  },

  /* ---------- client-side snapshot apply ---------- */
  applySnap(dt) {
    const snap = this.lastSnap;
    if (!snap) return;
    this.lastSnap = null;
    Waves.wave = snap.w;
    Enemies.kills = snap.k;
    // hives
    snap.h.forEach((hp, i) => {
      const s = World.spawners[i];
      if (!s) return;
      if (hp <= 0 && !s.dead) { s.hp = 0; hiveDownFX(s); }
      else if (!s.dead && hp < s.hp) { s.hp = hp; s.flash = 1; }
    });
    // enemies: update replicas
    const seen = {};
    for (const r of snap.e) {
      const [id, ty, x, y, z, ry] = r;
      seen[id] = true;
      let e = this.eById[id];
      if (!e) e = this.spawnReplica(id, ty);
      e.netTo.set(x, y, z);                 // dead too — host kicks broadcast the skid
      e.netRy = ry;
    }
    for (const id in this.eById) {
      const e = this.eById[id];
      if (!seen[id] && !e.dead) { e.dead = true; e.deathT = 0; }
    }
    // pickups
    const pkSeen = {};
    for (const r of snap.p) {
      const [id, ty, x, z] = r;
      pkSeen[id] = true;
      if (!this.pkById[id]) this.spawnPickupReplica(id, ty, x, z);
    }
    for (const id in this.pkById) {
      const p = this.pkById[id];
      if (!pkSeen[id] && !p.done) { p.done = true; Enemies.scene.remove(p.m); }
    }
  },

  spawnReplica(id, ty) {
    const roach = ty === 2, hunter = ty === 1;
    const mesh = roach ? buildRoachMesh() : buildZerglingMesh(hunter ? 1.5 : 1, hunter);
    const e = {
      mesh, hunter, roach, netId: id,
      // real stats so a migrated host can seamlessly take over the sim
      hp: roach ? 160 : hunter ? 120 : 34,
      speed: roach ? 3.0 : hunter ? 4.2 : 5.6,
      radius: roach ? 1.2 : hunter ? 1.05 : 0.7,
      attackCd: 0, spitCd: 2, lungeT: 0, lungeFrom: null, lungeTo: null,
      dead: false, deathT: 0, weave: 0, animT: 0, screechT: 2,
      netTo: new THREE.Vector3(), netRy: 0, replica: true,
    };
    mesh.userData.enemy = e;
    Enemies.scene.add(mesh);
    Enemies.list.push(e);
    this.eById[id] = e;
    Audio2.spawn(mesh.position.distanceTo(Player.pos));
    return e;
  },

  spawnPickupReplica(id, ty, x, z) {
    const m = new THREE.Mesh(ty === 0 ? _ammoGeo : _hpGeo, ty === 0 ? _ammoMat : _hpMat);
    m.position.set(x, 0.5, z);
    Enemies.scene.add(m);
    const p = { m, type: ty === 0 ? 'ammo' : 'health', t: 0, pkId: id };
    Enemies.pickups.push(p);
    this.pkById[id] = p;
  },

  /* ---------- per-frame ---------- */
  update(dt) {
    // countdown runs pre-match — before Net.on flips
    if (this.countT > 0 && !this.started) {
      // someone left mid-countdown — drop below minimum → hold the drop.
      // count by heartbeat freshness, not snapshot presence: a dead tab's
      // doc lingers in this.members until the next snapshot refilters it,
      // but its t ages out either way
      const live = Object.values(this.members).filter(m => this.fresh(m)).length;
      if (live < NET_MIN) {
        this.countT = -1;
        this.lobby(`WAITING — ${live}/${NET_MIN} MARINES`);
        return;
      }
      this.countT -= dt;
      const c = Math.ceil(this.countT);
      if (c > 0) this.lobby(`DROP IN ${c}…`);
      else { this.send('start', {}); this.begin(); }
      return;
    }
    if (!this.on) return;
    // my state @ ~10 Hz — Firestore bills per write, don't spray
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 0.1;
      if (this.stateRef) this.stateRef.doc(this.id).set({
        id: this.id, n: this.name, c: this.accent, u: Player.unit,
        x: Player.pos.x, y: Player.pos.y, z: Player.pos.z,
        yaw: Player.yaw, pitch: Player.pitch, hp: Math.ceil(Player.hp), dead: Player.dead,
      }).catch(() => {});
    }
    this.tickPeers(dt);
    // replica spit projectiles fly + can hurt ME
    for (const s of this.spitFx) {
      s.t += dt;
      s.vel.y -= 9 * dt;
      s.m.position.addScaledVector(s.vel, dt);
      const d = s.m.position.distanceTo(Player.pos.clone().setY(Player.pos.y + 1.3));
      if (d < 0.9 && !Player.dead) { damagePlayer(14, s.m.position); Enemies.scene.remove(s.m); s.done = true; }
      if (s.t > 4 || s.m.position.y < 0) { Enemies.scene.remove(s.m); s.done = true; }
    }
    this.spitFx = this.spitFx.filter(s => !s.done);
    // remote rockets — fly to their target point then detonate
    for (const ms of this.misFx) {
      const step = 26 * dt;
      ms.flown += step;
      ms.m.position.addScaledVector(ms.dir, step);
      ms.smokeT -= dt;
      if (ms.smokeT <= 0) { ms.smokeT = 0.035; spawnSmokePuff(ms.m.position); }
      if (ms.flown >= ms.dist) { explodeFx(ms.m.position.clone()); Enemies.scene.remove(ms.m); ms.done = true; }
    }
    this.misFx = this.misFx.filter(m => !m.done);
    if (this.isHost) this.hostTick(dt); else this.clientTick(dt);
  },

  hostTick(dt) {
    // real sim: enemies, waves, spawners, pickups already run in main loop
    this.snapT -= dt;
    this.pruneT -= dt;
    if (this.pruneT <= 0 && this.evRef) {
      this.pruneT = 10;
      // sweep stale events so the list doesn't grow forever
      const cutoff = firebase.firestore.Timestamp.fromMillis(this.serverNow() - 15000);
      this.evRef.where('t', '<', cutoff).get()
        .then(q => q.forEach(d => d.ref.delete()))
        .catch(() => {});
    }
    // snap @ 5 Hz — clients lerp over the 200 ms gap
    if (this.snapT > 0) return;
    this.snapT = 0.2;
    const e = [];
    for (const en of Enemies.list) {
      if (en.gone) continue;
      e.push([en.netId, en.roach ? 2 : en.hunter ? 1 : 0,
        +en.mesh.position.x.toFixed(2), +en.mesh.position.y.toFixed(2),
        +en.mesh.position.z.toFixed(2), +en.mesh.rotation.y.toFixed(2)]);
    }
    const pk = Enemies.pickups.filter(p => !p.done && p.pkId)
      .map(p => [p.pkId, p.type === 'ammo' ? 0 : 1, +p.m.position.x.toFixed(1), +p.m.position.z.toFixed(1)]);
    if (this.snapRef) this.snapRef.set({ w: Waves.wave, k: Enemies.kills, h: World.spawners.map(s => Math.max(0, Math.ceil(s.hp))), e, p: pk })
      .catch(() => {});
  },

  clientTick(dt) {
    this.applySnap(dt);
    // animate replicas toward their network targets
    for (const id in this.eById) {
      const e = this.eById[id], m = e.mesh;
      if (e.dead) {
        if (e.roach) {                            // big bugs still sink away
          e.deathT += dt;
          m.rotation.x = Math.min(Math.PI / 2, e.deathT * 6);
          m.position.y = -e.deathT * 0.5;
          if (e.deathT > 1.1) { Enemies.scene.remove(m); e.gone = true; delete this.eById[id]; }
        } else {
          updateCarcass(e, m, dt);                // same flop/gray/kick as host-side
          if (e.gone) { delete this.eById[id]; continue; }
          if (e.netTo) {                          // slide to net pos — but not y: carcasses sink
            m.position.x += (e.netTo.x - m.position.x) * Math.min(1, dt * 8);
            m.position.z += (e.netTo.z - m.position.z) * Math.min(1, dt * 8);
          }
        }
        continue;
      }
      const d0 = m.position.distanceTo(e.netTo);
      m.position.lerp(e.netTo, Math.min(1, dt * 10));
      m.rotation.y = e.netRy;
      e.animT += dt * (3 + Math.min(8, d0 * 4));
      const legs = m.userData.legs;
      if (legs) for (let i = 0; i < legs.length; i++)
        legs[i].rotation.x = Math.sin(e.animT + i * Math.PI) * 0.8;
      const wings = m.userData.wings;
      if (wings) for (let i = 0; i < wings.length; i++)
        wings[i].rotation.z = wings[i].userData.base - (i === 0 ? -1 : 1) * Math.sin(e.animT * 9) * 0.2;
      m.position.y = Math.abs(Math.sin(e.animT)) * 0.09;
    }
    Enemies.list = Enemies.list.filter(e => !e.gone);
  },

  /* wipe net entities — used on restart */
  resetMatch() {
    for (const id in this.peers) Enemies.scene.remove(this.peers[id].mesh);
    this.peers = {};
    this.eById = {}; this.pkById = {};
    this.spitFx.forEach(s => Enemies.scene.remove(s.m));
    this.spitFx = [];
    this.misFx.forEach(s => Enemies.scene.remove(s.m));
    this.misFx = [];
    this.lastSnap = null;
    this.nextEid = 1; this.nextPk = 1;
  },

  /* ---------- helpers called from game code ---------- */
  tellShot(hit) {
    // cosmetic tracer for everyone else
    this.send('shot', {
      id: this.id, mis: hit.mis ? 1 : 0, heal: hit.heal ? 1 : 0,
      ox: hit.o.x, oy: hit.o.y, oz: hit.o.z, tx: hit.e.x, ty: hit.e.y, tz: hit.e.z,
    });
  },
  hitEnemy(e, dmg, head) {
    if (this.isHost) damageEnemy(e, dmg, head, true);
    else this.send('edmg', { id: e.netId, dmg, head, by: this.id });
  },
  hitHive(s, dmg, from) {
    if (this.isHost) return damageSpawner(s, dmg, from);
    if (Math.hypot(s.pos.x - from.x, s.pos.z - from.z) > HIVE_RANGE) return false;
    this.send('sdmg', { i: World.spawners.indexOf(s), dmg, x: +from.x.toFixed(1), z: +from.z.toFixed(1) });
    return true;
  },
  tookPickup(p) {
    if (!this.isHost) this.send('pk', { id: p.pkId });
    p.done = true; Enemies.scene.remove(p.m);   // instant local feedback either way
  },
  comm(t) { this.send('comm', { n: this.name, t, c: this.accent }); },
  hurt(victimId, dmg, pos) { this.send('pdmg', { to: victimId, dmg, fx: pos.x, fz: pos.z }); },
};

/* small sprite name-tag for remote marines */
function makeNameTag(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 30px monospace'; g.textAlign = 'center';
  g.fillStyle = color || '#9fd0ff';
  g.fillText(name, 128, 42);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(1.6, 0.4, 1);
  return sp;
}

/* tracer visual for remote shots (does no damage — FX only) */
function tracerFx(from, to, heal) {
  const g = new THREE.BufferGeometry().setFromPoints([from, to]);
  const m = new THREE.Line(g, new THREE.LineBasicMaterial({ color: heal ? 0x5aff8a : 0x9fd0ff, transparent: true, opacity: 0.7 }));
  Enemies.scene.add(m);
  Player.tracers.push({ m, t: 0 });
}
