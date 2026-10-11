/* ============================================================
   defend.js — DEFEND THE CITY: 12 towers, civilians, 10 waves
   Lose a single tower and the city falls with it.
   ============================================================ */

const Defend = {
  active: false, lost: false, won: false, failT: -1,
  wave: 0, waveMax: 10, perWave: 100,
  waveLeft: 0, feedT: 0, betweenT: 0, pause: false,
  city: [], civs: [], sign: null,
  C: { x: 0, z: -64 },                          // district heart — south of the pad

  liveCount() {
    return Enemies.list.filter(e => !e.dead && !e.gone).length + spawnQueue.length;
  },
  standing() { return this.city.filter(b => !b.dead).length; },

  nearest(p) {
    let best = null, bd = Infinity;
    for (const b of this.city) {
      if (b.dead) continue;
      const d = Math.hypot(b.pos.x - p.x, b.pos.z - p.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  },
  /* raiders get a standing tower of their own — spread the siege */
  pickTower() {
    const up = this.city.filter(b => !b.dead);
    return up.length ? up[Math.floor(Math.random() * up.length)] : null;
  },

  /* ---------- towers ---------- */
  _tower(bx, bz, seed) {
    const g = new THREE.Group();
    const w = 8 + (seed % 3) * 2.2 + Math.random() * 3,
          h = 18 + Math.random() * 22,
          d = 8 + Math.random() * 4;
    const bmat = new THREE.MeshStandardMaterial({ color: 0x27303f, roughness: .8, metalness: .25 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bmat);
    body.position.y = h / 2; g.add(body);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w * .68, 2.4, d * .68), bmat);
    cap.position.y = h + 1.2; g.add(cap);
    const wmat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });
    for (let i = 0; i < 3; i++) {                    // lit window bands, front + back
      const y = h * (0.3 + i * 0.22);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(w * .82, .55), wmat);
      f.position.set(0, y, d / 2 + .04); g.add(f);
      const b2 = f.clone(); b2.position.z = -d / 2 - .04; b2.rotation.y = Math.PI; g.add(b2);
    }
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(.42, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xff5a4a }));
    beacon.position.y = h + 2.9; g.add(beacon);
    g.position.set(bx, 0, bz);
    Enemies.scene.add(g);
    const r = Math.max(w, d) * .62;
    const col = { x: bx, z: bz, r }, sgt = { x: bx, z: bz, r, h };
    World.colliders.push(col); World.sight.push(sgt);
    const b = {
      mesh: g, pos: new THREE.Vector3(bx, 0, bz), r, h,
      hp: 1000, maxHp: 1000,
      dead: false, rubble: false, flash: 0, fallT: 0,
      bmat, wmat, beacon, col, sgt,
    };
    this.city.push(b);
    return b;
  },

  /* ---------- mission lifecycle ---------- */
  start() {
    this.clear();
    this.active = true; this.lost = false; this.won = false; this.failT = -1;
    this.wave = 0; this.waveLeft = 0; this.betweenT = 7; this.pause = false;
    // the nests sit this one out — the swarm marches in waves, not egg bursts
    for (const s of World.spawners) s.dead = true;
    // the district — twelve towers ringing a plaza
    const xs = [-30, -10, 10, 30], zs = [-88, -64, -40];
    let k = 0;
    for (const bz of zs) for (const bx of xs)
      this._tower(bx + (Math.random() - .5) * 7, bz + (Math.random() - .5) * 6, k++);
    // civilians on the streets — the ones you're holding the line for
    for (let i = 0; i < 22; i++) {
      const m = Intro.civMesh();
      m.scale.setScalar(2.3);
      let cx = 0, cz = 0;
      for (let tr = 0; tr < 6; tr++) {
        cx = this.C.x + (Math.random() - .5) * 84;
        cz = this.C.z + (Math.random() - .5) * 66;
        if (!this.city.some(b => Math.hypot(b.pos.x - cx, b.pos.z - cz) < b.r + 2)) break;
      }
      m.position.set(cx, 0, cz);
      Enemies.scene.add(m);
      this.civs.push({ m, tx: 0, tz: 0, spd: 5.5 + Math.random() * 3, dead: false, fellDone: false, ph: Math.random() * 7 });
    }
    this.spawnLine();                                  // the company holds the line
    this._sign(0, -11);                                // the posted order
    UI.waveBanner('DEFEND THE CITY — LOSE A TOWER, LOSE IT ALL');
    Audio2.say && Audio2.say('Civilians on the streets — hold every tower, marines.', { rate: .95 });
  },

  clear() {
    for (const b of this.city) {
      Enemies.scene.remove(b.mesh);
      const i1 = World.colliders.indexOf(b.col); if (i1 >= 0) World.colliders.splice(i1, 1);
      const i2 = World.sight.indexOf(b.sgt);       if (i2 >= 0) World.sight.splice(i2, 1);
    }
    for (const c of this.civs) Enemies.scene.remove(c.m);
    if (this.sign) { Enemies.scene.remove(this.sign); this.sign = null; }
    this.city = []; this.civs = [];
    this.active = this.lost = this.won = false; this.failT = -1;
    this.wave = 0; this.waveLeft = 0;
  },

  /* the company — 29 marines shoulder to shoulder across the approach,
     three marauder chassis spaced through the rank */
  spawnLine() {
    clearAllies();
    const N = 29, GAP = 3.4, LZ = -16, X0 = -(N - 1) / 2 * GAP;
    const pool = Allies.names.concat(REINF_NAMES);
    const leads = [4, 14, 24];
    for (let i = 0; i < N; i++) {
      const isLead = leads.includes(i);
      const mesh = (isLead ? buildMarauderMesh : buildMarineMesh)(playerAccent());
      mesh.add(Intro._chestRig(isLead));               // same four-corner hatch as your rig
      const px = X0 + i * GAP;
      const a = mkAlly(i,
        i < pool.length ? pool[i]
          : pool[i % pool.length] + '-' + (1 + Math.floor(i / pool.length)),
        '#' + Allies.accents[i % Allies.accents.length].toString(16).padStart(6, '0'),
        isLead, mesh, { x: 0, z: 0 },
        new THREE.Vector3(px, 0, LZ));
      a.hold = { x: px, z: LZ };                       // posted — the sign is the order
    }
    buildSquadHud();
  },

  /* a painted order on a post — reads as you walk out of the drop */
  _sign(x, z) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(.18, 2.7, .18),
      new THREE.MeshStandardMaterial({ color: 0x3a4450, roughness: .8 }));
    post.position.y = 1.35; g.add(post);
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 256;
    const c = cv.getContext('2d');
    c.fillStyle = '#0d141d'; c.fillRect(0, 0, 512, 256);
    c.strokeStyle = '#ffb04a'; c.lineWidth = 10; c.strokeRect(8, 8, 496, 240);
    c.fillStyle = '#ffb04a'; c.font = 'bold 30px monospace'; c.textAlign = 'center';
    c.fillText('RECOMMENDED:', 256, 58);
    c.fillStyle = '#cfe4ff'; c.font = '23px monospace';
    c.fillText('STAY WHERE YOU ARE', 256, 112);
    c.fillText('UNLESS THEY TRY', 256, 150);
    c.fillText('TO ATTACK YOU', 256, 188);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 1.9),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) }));
    board.position.y = 2.5; g.add(board);              // plane faces +z — toward the drop
    const cap = new THREE.Mesh(new THREE.BoxGeometry(4.1, .12, .12),
      new THREE.MeshStandardMaterial({ color: 0x3a4450, roughness: .8 }));
    cap.position.y = 3.5; g.add(cap);
    g.position.set(x, 0, z);
    Enemies.scene.add(g);
    this.sign = g;
  },

  /* wave spawn point — comes out of the wilds on the side you're holding,
     a few pincers slip in from anywhere so flanks stay honest */
  ringPos() {
    const side = Math.atan2(Player.pos.x - this.C.x, Player.pos.z - this.C.z);
    const a = Math.random() < .2
      ? Math.random() * Math.PI * 2                                    // pincer
      : side + (Math.random() - .5) * (this.wave > 4 ? 3.4 : 2.2);     // your side
    const r = 140 + Math.random() * 70;
    return { x: this.C.x + Math.sin(a) * r, z: this.C.z + Math.cos(a) * r };
  },

  /* a raider working a wall — flash, debris, and finally the lean */
  chew(b, e, dt) {
    if (b.dead || this.lost) return;
    b.hp -= (e.ultra ? 90 : e.hunter ? 20 : 9) * dt;
    b.flash = Math.min(1, b.flash + dt * 5);
    if (Math.random() < dt * 7) {
      const p = new THREE.Vector3(
        b.pos.x + (e.mesh.position.x - b.pos.x) * .5,
        1.2 + Math.random() * 2.2,
        b.pos.z + (e.mesh.position.z - b.pos.z) * .5);
      bloodBurst(p, 2);
    }
    if (b.hp <= 0) {
      b.dead = true; b.fallT = 0;
      b.wmat.color.setHex(0x141a22);                       // windows go dark
      b.beacon.visible = false;
      this.lost = true; this.failT = 2.4;
      UI.waveBanner('A TOWER IS FALLING — THE CITY IS LOST');
      Audio2.kill(30);
      try { Audio2.noise(1.2, .9, 90, 1.4); } catch (e2) {}
    }
  },

  nextWave() {
    this.wave++;
    this.waveLeft = this.perWave;
    this.betweenT = 11;
    this.pause = false;
    UI.waveBanner(`WAVE ${this.wave}/${this.waveMax} — INBOUND`);
    Audio2.wave();
  },

  win() {
    if (this.won) return;
    this.won = true;
    Game.victory();
  },

  update(dt) {
    const t = Game.time;

    /* towers — chew-flash decays; the dead one goes down in a slow lean */
    for (const b of this.city) {
      if (b.flash > 0) {
        b.flash = Math.max(0, b.flash - dt * 3);
        b.bmat.emissive.setHex(0xff3020);
        b.bmat.emissiveIntensity = b.flash * .8;
        b.mesh.position.x = b.pos.x + (Math.random() - .5) * b.flash * .35;
        b.mesh.position.z = b.pos.z + (Math.random() - .5) * b.flash * .35;
      } else if (!b.dead) {
        b.bmat.emissiveIntensity = 0;
      }
      if (b.dead && !b.rubble) {
        b.fallT += dt;
        const k = Math.min(1, b.fallT / 2.2);
        b.mesh.rotation.z = k * .5;
        b.mesh.position.y = -(k * k) * b.h * .55;
        if (b.fallT > 1) {                                 // rubble — walk over it
          if (!b.rubble) {
            const i1 = World.colliders.indexOf(b.col); if (i1 >= 0) World.colliders.splice(i1, 1);
            const i2 = World.sight.indexOf(b.sgt);       if (i2 >= 0) World.sight.splice(i2, 1);
          }
          b.rubble = true;
        }
      }
    }

    /* civilians — wander the plaza, bolt from the nearest bug */
    for (const c of this.civs) {
      const cp = c.m.position;
      if (c.dead) {
        if (!c.fellDone) {
          c.m.rotation.x += (1.5 - c.m.rotation.x) * Math.min(1, dt * 5);
          if (1.5 - c.m.rotation.x < .04) { c.m.rotation.x = 1.5; c.fellDone = true; }
        }
        continue;
      }
      let bd = 12, lx = 0, lz = 0, threat = false;
      for (const e of Enemies.list) {
        if (e.dead) continue;
        const d = Math.hypot(e.mesh.position.x - cp.x, e.mesh.position.z - cp.z);
        if (d < bd) { bd = d; lx = e.mesh.position.x; lz = e.mesh.position.z; threat = true; }
      }
      if (threat && bd < 1.0) {
        c.dead = true;
        try { bloodBurst(cp.clone().setY(.4), 4); } catch (e) {}
        continue;
      }
      let gx, gz;
      if (threat && bd < 9) {                            // bug close — run the other way
        const fx = cp.x - lx, fz = cp.z - lz, fd = Math.hypot(fx, fz) || 1;
        gx = cp.x + fx / fd * 14; gz = cp.z + fz / fd * 14;
      } else {
        if (!c.tx || Math.hypot(c.tx - cp.x, c.tz - cp.z) < .6) {
          c.tx = this.C.x + (Math.random() - .5) * 80;
          c.tz = this.C.z + (Math.random() - .5) * 62;
        }
        gx = c.tx; gz = c.tz;
      }
      const dx = gx - cp.x, dz = gz - cp.z, dd = Math.hypot(dx, dz) || 1;
      const sp = c.spd * (threat && bd < 9 ? 1.4 : 1);
      const res = worldCollide(cp.x + dx / dd * sp * dt, cp.z + dz / dd * sp * dt, .4);
      cp.x = res.x; cp.z = res.z;
      cp.y = Math.abs(Math.sin(t * 12 + c.ph)) * .07;
      c.m.rotation.y = Math.atan2(dx, dz);
    }

    /* the tower's down — let the lean play, then call it */
    if (this.lost) {
      if (this.failT > 0) {
        this.failT -= dt;
        if (this.failT <= 0) Game.gameOver();
      }
      return;
    }

    /* ---------- wave manager — 100 a wave, drip-fed under the live cap ---------- */
    const live = this.liveCount();
    if (this.waveLeft <= 0 && live === 0) {
      if (this.wave >= this.waveMax && this.wave > 0) { this.win(); return; }
      this.betweenT -= dt;
      if (!this.pause) {
        this.pause = true;
        if (this.wave > 0) {
          UI.waveBanner(`WAVE ${this.wave} CLEAR — RE-ARM`);
          Audio2.say && Audio2.say('Wave clear — reload, re-arm, they\'re not done.', { rate: .95 });
        }
      }
      if (this.betweenT <= 0) this.nextWave();
    }
    if (this.waveLeft > 0 && live < 64) {
      this.feedT -= dt;
      if (this.feedT <= 0) {
        this.feedT = .1;
        const type = this.wave >= 4 && Math.random() < .3 ? 'hunter' : 'zergling';
        queueSpawn(type, this.ringPos());
        this.waveLeft--;
      }
    }
  },
};
