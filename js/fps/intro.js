/* ============================================================
   intro.js — suit-up cinematic: barracks room, CMC armor on a
   rack, chest opens, you step in, it seals, suit boots (~5s),
   the barracks door opens, you walk out to the fight.
   Renders its own scene/camera while Intro.playing is true.
   ============================================================ */

const _ez = x => x * x * (3 - 2 * x);           // smoothstep
const _lz = (a, b, x) => a + (b - a) * x;
const _flameGeo = new THREE.ConeGeometry(.55, 1.5, 6);
const _flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a1e, transparent: true, opacity: .8 });

const Intro = {
  playing: false, menu: false, visiting: false, t: 0, menuT: 0, cb: null,
  scene: null, cam: null,
  chest: null, door: null, doorGlow: null, outLight: null,
  look: new THREE.Vector3(), armed: false,
  vYaw: Math.PI, vPitch: 0, vYawT: Math.PI, vPitchT: 0,
  vPos: new THREE.Vector3(0, 0, 2.4), bobT: 0, vY: 0, stepT: 0,
  _vMove: null, _vClick: null, _vRay: null, _vNdc: null,
  _suitHot: false, onSuitTap: null,
  // opening story — flies the REAL map while eggs hatch and the pack runs
  story: false, storyT: 0, storyCam: null, storyMarines: [], storyFx: [], fxT: 0,
  storyFire: null, smokeT: 0, _boomed: false, storyCity: [], storyCivs: [], killT: 0,

  civMesh() {                                    // tiny panicked citizen
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, .6, 5),
      new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), .45, .5), roughness: .9 }));
    b.position.y = .44; g.add(b);
    const h = new THREE.Mesh(new THREE.SphereGeometry(.11, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0xd8a880, roughness: .9 }));
    h.position.y = .84; g.add(h);
    return g;
  },

  fatigueMesh(accent) {                          // trooper out of armor — fatigues + squad-color cap
    const g = new THREE.Group();
    const fat = new THREE.MeshStandardMaterial({ color: 0x4b4f3a, roughness: .9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd8a880, roughness: .85 });
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(.17, .2, .72, 6),
      new THREE.MeshStandardMaterial({ color: 0x33382b, roughness: .9 }));
    legs.position.y = .36; g.add(legs);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(.2, .24, .62, 7), fat);
    torso.position.y = 1.0; g.add(torso);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .5, 5), fat);
      arm.position.set(s * .28, .98, 0); g.add(arm);
    }
    const head = new THREE.Mesh(new THREE.SphereGeometry(.13, 7, 6), skin);
    head.position.y = 1.52; g.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.14, .145, .09, 7),
      new THREE.MeshStandardMaterial({ color: accent, roughness: .8 }));
    cap.position.y = 1.63; g.add(cap);
    return g;
  },

  /* ---------- one-time scene build ---------- */
  build() {
    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color(0x06090f);
    s.fog = new THREE.Fog(0x06090f, 7, 30);

    const armor = new THREE.MeshStandardMaterial({ color: 0x2a3542, roughness: .6, metalness: .35 });
    const joint = new THREE.MeshStandardMaterial({ color: 0x141a22, roughness: .95 });
    const dark  = new THREE.MeshStandardMaterial({ color: 0x05080c, roughness: 1 });
    const wall  = new THREE.MeshStandardMaterial({ color: 0x1a2531, roughness: .8, metalness: .25 });
    const floor = new THREE.MeshStandardMaterial({ color: 0x11161d, roughness: .9, metalness: .3 });
    const glowC = new THREE.MeshStandardMaterial({ color: 0x06202c, emissive: 0x4ad0ff, emissiveIntensity: 1.4 });
    const glowW = new THREE.MeshBasicMaterial({ color: 0xfff2d8 });

    const B = (w, h, d, m, x, y, z, parent) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      (parent || s).add(b);
      return b;
    };

    /* --- barracks box: 12 wide, 4 high, door wall at z=+6 --- */
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(12, 14), floor);
    fl.rotation.x = -Math.PI / 2; s.add(fl);
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(12, 14), wall);
    ce.rotation.x = Math.PI / 2; ce.position.y = 4; s.add(ce);
    // back wall — full-height 6-wide bay so the pad/base outside stays in view
    B(3, 4, .2, wall, -4.5, 2, -6);
    B(3, 4, .2, wall, 4.5, 2, -6);
    B(.1, .04, 6, glowC, -3, .015, -6);                 // threshold strips
    B(.1, .04, 6, glowC, 3, .015, -6);
    B(.2, 4, 14, wall, -6, 2, 0);                       // side walls
    B(.2, 4, 14, wall, 6, 2, 0);
    // door wall — two panels + lintel leave a 1.8 x 2.7 doorway
    B(5.1, 4, .2, wall, -3.45, 2, 6);
    B(5.1, 4, .2, wall, 3.45, 2, 6);
    B(1.8, 1.3, .2, wall, 0, 3.35, 6);
    this.door = B(1.8, 2.7, .14, armor, 0, 1.35, 6);    // slides up
    B(.08, 2.7, .1, glowC, -0.98, 1.35, 5.95);          // frame strips
    B(.08, 2.7, .1, glowC, 0.98, 1.35, 5.95);
    // floor guide strips running to the door
    B(.1, .02, 11, glowC, -0.9, .01, 0);
    B(.1, .02, 11, glowC, 0.9, .01, 0);
    // ceiling light bars
    B(3, .06, .5, glowW, 0, 3.96, 2.2);
    B(3, .06, .5, glowW, 0, 3.96, -2.2);
    // exit tunnel behind the door — ends in blown-out light
    B(.15, 3.2, 4, wall, -1, 1.6, 8);
    B(.15, 3.2, 4, wall, 1, 1.6, 8);
    B(2, .15, 4, wall, 0, 3.2, 8);
    const tunnelFl = new THREE.Mesh(new THREE.PlaneGeometry(2, 4), floor);
    tunnelFl.rotation.x = -Math.PI / 2; tunnelFl.position.set(0, 0, 8); s.add(tunnelFl);
    this.doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(2, 3.4), glowW);
    this.doorGlow.position.set(0, 1.6, 9.8);
    this.doorGlow.rotation.y = Math.PI;
    this.doorGlow.material.transparent = true;
    this.doorGlow.material.opacity = 0.06;              // sealed — barely leaks
    s.add(this.doorGlow);

    s.add(new THREE.AmbientLight(0x2a3a4d, .85));
    const key = new THREE.PointLight(0x8fc8ff, .9, 18); key.position.set(0, 3.4, 2.2); s.add(key);
    const rim = new THREE.PointLight(0x4ad0ff, .5, 10); rim.position.set(-3, 2.2, -3); s.add(rim);
    this.outLight = new THREE.PointLight(0xfff0d0, 0, 14);
    this.outLight.position.set(0, 2, 7.5); s.add(this.outLight);

    /* --- your base on the pad outside — lifts off and warps away --- */
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), floor);
    apron.rotation.x = -Math.PI / 2; apron.position.set(0, .012, -9); s.add(apron);
    B(4.4, .12, 4.4, joint, 0, .06, -9);                // landing pad
    B(.12, .02, 4.4, glowC, -2.1, .125, -9);            // pad edge lights
    B(.12, .02, 4.4, glowC, 2.1, .125, -9);
    const glowO = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
    const base = this.base = new THREE.Group(); base.position.set(0, .12, -9); s.add(base);
    B(2.6, .5, 2.2, wall, 0, .37, 0, base);             // skirt
    B(2.1, 1.1, 1.7, armor, 0, 1.15, 0, base);          // hull
    B(1.5, .6, 1.2, joint, 0, 1.95, 0, base);           // upper deck
    B(.6, .35, .6, armor, 0, 2.35, 0, base);            // crown
    B(.06, 1, .06, joint, .8, 2.4, 0, base);            // antenna
    B(.1, .1, .1, glowC, .8, 2.95, 0, base);            // beacon
    B(1.6, .06, .02, glowC, 0, 1.0, .86, base);         // window strips
    B(1.6, .06, .02, glowC, 0, 1.35, .86, base);
    for (const lx of [-1.05, 1.05]) for (const lz of [-.8, .8])
      B(.2, .4, .2, joint, lx, .2, lz, base);           // landing legs
    this.baseLight = new THREE.PointLight(0x6aa8ff, .8, 18);
    this.baseLight.position.set(0, 3, -7.5); s.add(this.baseLight);

    /* --- the CMC suit on its rack — the real battle mesh, front (+z) out --- */
    const suit = this.suit = new THREE.Group(); s.add(suit);
    B(.5, .08, .5, joint, 0, .04, -.2, suit);                       // rack base
    B(.1, 1.9, .1, joint, 0, .95, -.48, suit);                      // rack post
    B(.14, .3, .14, joint, 0, 1.75, -.42, suit);                    // head mount
    B(.1, .2, .3, joint, -.34, 1.5, -.3, suit);                     // shoulder clamps
    B(.1, .2, .3, joint, .34, 1.5, -.3, suit);

    // cavity + core + chest panels ride on whatever suit body is racked
    this.cavity = B(.5, .66, .05, dark, 0, 1.18, .2);
    this.core = B(.16, .16, .03, glowC, 0, 1.18, .215);
    this.core.material = this.core.material.clone();
    this.panels = [];
    for (const [cx, cy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(cx * .27, 1.18 + cy * .33, .24);           // at the suit's corner
      pivot.userData.axis = new THREE.Vector3(-cy, cx, 0).normalize(); // tangent → swings out
      const plate = B(.26, .33, .06, armor, -cx * .135, -cy * .16, .03, pivot);
      plate.material = plate.material.clone();
      plate.material.color.setHex(0x36495e);
      B(.05, .05, .065, glowC, -cx * .06, -cy * .08, .04, pivot);   // corner light
      this.panels.push(pivot);
    }
    this.suitFor('marine');                                         // default rig

    /* --- your squad billets here — two ranks at ease flanking the aisle --- */
    this.squadList = [];
    const SLOT_POS = [
      [-2.15, -3.5], [-2.15, -1.6], [-2.15, 0.3], [-2.15, 2.2], [-2.15, 4.1],
      [ 2.15, -2.6], [ 2.15, -0.7], [ 2.15, 1.2], [ 2.15, 3.1],
    ];
    for (let i = 0; i < Allies.names.length; i++) {
      const isLead = i === 0 || i === 4;                            // commanders wear marauder chassis
      const bare = this.fatigueMesh(Allies.accents[i]);             // at ease — armor stays racked
      s.add(bare);
      const [sx, sz] = SLOT_POS[i];
      const go = 9.0 + (4.1 - sz) * 0.30;                           // front rank leaves first
      this.squadList.push({
        m: bare, bare, suited: null,                                // 'suited' swaps in on deploy
        isLead, accent: Allies.accents[i],
        suitT: go - 0.9,                                            // armor locks right before step-off
        x: sx, z: sz,
        ry: sx < 0 ? Math.PI / 2 : -Math.PI / 2,                    // face the aisle
        ph: Math.random() * 7,
        lane: sx < 0 ? -0.42 : 0.42,                                // file out two abreast
        go,
      });
    }
    this.billetSquad();
  },

  /* park everyone back on their billet marks — armor goes back on the rack */
  billetSquad() {
    for (const q of this.squadList || []) {
      if (q.suited) { this.scene.remove(q.suited); q.suited = null; q.m = q.bare; }
      q.m.position.set(q.x, 0, q.z);
      q.m.rotation.set(0, q.ry, 0);
      q.m.visible = true;
    }
  },

  /* called during the deploy cinematic — rigs lock on one by one before the door */
  suitUpSquad(t) {
    for (const q of this.squadList) {
      if (q.suited || t < q.suitT) continue;
      const arm = (q.isLead ? buildMarauderMesh : buildMarineMesh)(q.accent);
      for (const k of ['barBg', 'barFg', 'star'])
        if (arm.userData[k]) arm.userData[k].visible = false;
      arm.position.copy(q.m.position); arm.rotation.copy(q.m.rotation);
      q.bare.visible = false;
      this.scene.add(arm);
      q.m = q.suited = arm;
      try { Audio2.noise(.12, .07, 1000, .9); } catch (e) {}        // servo snick
    }
  },

  /* idle sway in ranks — or file out the door ahead of you once it opens */
  squadUpdate(dt, t, marching) {
    for (const s of this.squadList) {
      const m = s.m;
      if (marching && t > s.go) {
        m.position.x += (s.lane - m.position.x) * Math.min(1, dt * 4);
        m.position.z += 2.3 * dt;
        m.rotation.y += (0 - m.rotation.y) * Math.min(1, dt * 5);   // square on the door
        m.position.y = Math.abs(Math.sin(t * 11 + s.ph)) * .07;     // march step
        if (m.position.z > 9.2) m.visible = false;                  // swallowed by the light
      } else {
        m.position.y = Math.sin(t * 1.1 + s.ph) * .012;             // idle breath
        m.rotation.y = s.ry + Math.sin(t * .45 + s.ph) * .05;
      }
    }
  },

  /* swap the racked rig to the class the player picked */
  suitFor(unit) {
    if (this.suitBody && this.suitUnit === unit) return;
    if (this.suitBody) this.suit.remove(this.suitBody);
    const accent = unit === 'marauder' ? 0xff8a3a : unit === 'medic' ? 0x5aff8a : 0x4ad0ff;
    const body = unit === 'marauder' ? buildMarauderMesh(accent) : buildMarineMesh(accent);
    const gun = body.userData.gun || body.children.find(c => c.isGroup);
    if (gun) body.remove(gun);                                    // weapon stays on the rack
    if (body.userData.barBg)
      body.userData.barBg.visible = body.userData.barFg.visible = false;
    body.add(this.cavity, this.core, ...this.panels);             // chest rig rides the new suit
    this.suit.add(body);
    this.suitBody = body; this.suitUnit = unit;
    this.setChest(0);
  },

  /* 1 = iris fully open, 0 = sealed shut */
  setChest(open) {
    const ang = open * 1.85;
    for (const p of this.panels)
      p.quaternion.setFromAxisAngle(p.userData.axis, ang);
    if (this.core) this.core.material.emissiveIntensity = .3 + open * 2.2;
  },

  /* ---------- run ---------- */
  /* start screen sits inside the barracks — slow drift past the suit rack */
  show() {
    if (!this.scene) this.build();
    if (!this.cam)
      this.cam = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .05, 60);
    else this.cam.aspect = innerWidth / innerHeight, this.cam.updateProjectionMatrix();
    this.menu = true; this.menuT = Math.random() * 40;
    this.billetSquad();                                             // squad back on their marks
    document.getElementById('intro-fade').style.opacity = 0;
  },

  active() { return this.playing || this.menu || this.visiting || this.story; },

  /* ---------- opening story — the assault, no words ---------- */
  playStory(cb) {
    if (!this.storyCam)
      this.storyCam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .1, 2000);
    else this.storyCam.aspect = innerWidth / innerHeight, this.storyCam.updateProjectionMatrix();
    this.story = true; this.storyT = 0; this.fxT = 0; this.cb = cb; this.armed = false;
    document.getElementById('startscreen').classList.add('hidden');
    document.getElementById('storyscreen').classList.remove('hidden');
    document.getElementById('story-text').style.display = 'none';   // no words
    document.getElementById('story-skip').textContent = 'TAP ANYWHERE TO SKIP \u25B8';
    const f = document.getElementById('intro-fade');
    f.style.background = '#000'; f.style.opacity = 1;
    // eggs already warm — the swarm starts hatching almost at once
    for (const s of World.spawners)
      for (const eg of s.eggs) eg.t = EGG_T * (0.35 + Math.random() * 0.8);
    // guaranteed opening wave — every hive vomits a pack before the eggs even pop
    for (const s of World.spawners) {
      for (let i = 0; i < 8; i++) {
        const p = s.pos.clone();
        p.x += (Math.random() - .5) * 7; p.z += (Math.random() - .5) * 7;
        spawnEnemy('zergling', p);
      }
    }
    // THE SWARM — ~200 lings pouring out of the dark. Facade Groups ride
    // Enemies.list so all the story AI below drives them; two InstancedMesh
    // draws render the whole tide for ~2 draw calls instead of thousands.
    this.horde = [];
    const HORDE_N = 200;
    const hordeBody = new THREE.InstancedMesh(
      new THREE.SphereGeometry(.5, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .8 }), HORDE_N);
    const hornGeo = new THREE.ConeGeometry(.11, .62, 5);
    hornGeo.rotateX(-Math.PI / 2 + .45);                       // crest swept back
    hornGeo.translate(0, .8, .42);
    const hordeHorn = new THREE.InstancedMesh(hornGeo,
      new THREE.MeshStandardMaterial({ color: 0x33122a, roughness: 1 }), HORDE_N);
    hordeBody.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    hordeHorn.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < HORDE_N; i++) {
      const m = new THREE.Group();
      m.position.set((Math.random() - .5) * 140, 0, -42 - Math.random() * 130);
      const s = .8 + Math.random() * .4;
      m.scale.set(s * .9, s * .75, s * 1.35);                  // sphere → ling silhouette
      hordeBody.setColorAt(i, new THREE.Color()
        .setHSL(.82 + Math.random() * .06, .4, .18 + Math.random() * .12));
      this.horde.push({ mesh: m, im: i });
      Enemies.list.push(this.horde[i]);
    }
    hordeBody.instanceColor.needsUpdate = true;
    Enemies.scene.add(hordeBody, hordeHorn);
    this.hordeIm = [hordeBody, hordeHorn];
    // the city — three times the sprawl: dense tower grid + distant silhouette ring
    this.storyCity = [];
    const towerAt = (bx, bz, far) => {
      const h = far ? 6 + Math.random() * 12 : 3 + Math.random() * 8,
        w = far ? 3 + Math.random() * 2.4 : 1.9 + Math.random() * 1.8;
      const g = new THREE.Group();
      const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, w),
        new THREE.MeshStandardMaterial({ color: far ? 0x141c26 : 0x232e3a, roughness: .8, metalness: .3 }));
      tower.position.y = h / 2; g.add(tower);
      const winMat = new THREE.MeshBasicMaterial({ color: 0x64d8ff });   // lit windows
      if (!far) for (let wy = .7; wy < h - .3; wy += 1.15) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(w * .78, .1, .02), winMat);
        s.position.set(0, wy, w / 2 + .015); g.add(s);
      }
      g.position.set(bx, 0, bz);
      Enemies.scene.add(g);
      // ruin rolls north→south; the ultras also just flatten what they touch
      this.storyCity.push({ g, winMat, h, bx, bz, far,
        fallT: 16.5 + (bz + 8) / 64 * 3.5 + Math.random() * .7,
        dir: Math.random() < .5 ? -1 : 1, fell: false });
    };
    for (let gx = -58; gx <= 58; gx += 6.5)
      for (let gz = 14; gz <= 58; gz += 6.5) {
        const bx = gx + (Math.random() - .5) * 3, bz = gz + (Math.random() - .5) * 3;
        if (Math.abs(bx) < 5 && bz < 24) continue;          // keep the pad + hull clear
        if (Math.random() < .16) continue;                  // gaps = streets
        towerAt(bx, bz, false);
      }
    for (let i = 0; i < 40; i++) {                          // skyline silhouettes
      const a = Math.random() * Math.PI * 2, r = 62 + Math.random() * 26;
      towerAt(Math.cos(a) * r, 30 + Math.sin(a) * r * .7, true);
    }

    // THE WALL — two deep ranks across the whole approach, marauders interleaved
    this.storyMarines = [];
    let wRank = 0;
    for (const [rz, step, xoff] of [[9.4, 2.7, 0], [11.9, 2.7, 1.35]]) {
      wRank++;
      for (let wx = -27 + xoff; wx <= 27; wx += step) {
        const kind = (wRank === 2 && Math.round(wx) % 8 < 3) ? 'rau' : 'mar';
        const m = (kind === 'rau' ? buildMarauderMesh : buildMarineMesh)(0x4ad0ff);
        m.position.set(wx + (Math.random() - .5) * .5, 0, rz + (Math.random() - .5) * .4);
        m.rotation.y = Math.PI + (Math.random() - .5) * .16;   // face the swarm
        for (const k of ['barBg', 'barFg', 'star']) if (m.userData[k]) m.userData[k].visible = false;
        m.userData.strafe = Math.random() < .5 ? -1 : 1;
        m.userData.wall = true;                                // hold the line — no wandering
        Enemies.scene.add(m);
        this.storyMarines.push(m);
      }
    }
    for (const fx of [-31, 31]) {                              // marauder anchors on the flanks
      const m = buildMarauderMesh(0x4ad0ff);
      m.position.set(fx, 0, 10.6);
      m.rotation.y = Math.PI;
      for (const k of ['barBg', 'barFg', 'star']) if (m.userData[k]) m.userData[k].visible = false;
      m.userData.strafe = fx < 0 ? 1 : -1;
      m.userData.wall = true;
      Enemies.scene.add(m);
      this.storyMarines.push(m);
    }

    // civilians loose in the streets — a hundred screaming dots, some don't make it
    this.storyCivs = [];
    for (let i = 0; i < 100; i++) {
      const m = this.civMesh();
      m.position.set((Math.random() - .5) * 52, 0, 2 + Math.random() * 32);
      Enemies.scene.add(m);
      this.storyCivs.push({ m, tx: 0, tz: 0, spd: 4 + Math.random() * 2.4, fell: false, ph: Math.random() * 7 });
    }

    // the two ultralisks — parked past the wall's flank; they charge in late
    this.storyUltras = [];
    for (const ux of [-26, 26]) {
      const u = buildUltraliskMesh();
      u.position.set(ux, 0, -38);
      u.rotation.y = Math.PI;                                  // snorting at the skyline, waiting
      Enemies.scene.add(u);
      this.storyUltras.push({ m: u, tgt: null, spd: 10.5 + Math.random() * 1.5, ph: Math.random() * 7 });
    }
    if (World.base) {                                    // wreck state + fire light
      World.base.g.rotation.set(0, 0, 0); World.base.g.position.y = .12;
      this.storyFire = new THREE.PointLight(0xff6a22, 0, 14);
      this.storyFire.position.set(0, 1.6, 18);
      Enemies.scene.add(this.storyFire);
      this.cityGlow = new THREE.PointLight(0xff7a20, 0, 60);   // burning-block glow
      Enemies.scene.add(this.cityGlow);
    }
    this.smokeT = 0; this._boomed = false; this.killT = 0; this.ultraGo = false;
    this.sAmb = .6; this.sGun = 5; this.sScr = 1.5;            // soundscape timers
    const tt = document.getElementById('story-title'); if (tt) tt.style.opacity = 0;
    try { Audio2.ensure && Audio2.ensure(); } catch (e) {}
    this._skip = () => { if (this.armed) this.stop(); };
    setTimeout(() => { this.armed = true; }, 900);
    document.addEventListener('keydown', this._skip);
    document.addEventListener('mousedown', this._skip);
  },

  storyUpdate(dt) {
    const t = this.storyT += dt, cam = this.storyCam;
    const f = document.getElementById('intro-fade');
    if (t < 1.1) f.style.opacity = 1 - t / 1.1;           // fade in from black
    else if (t > 21.4) {                                 // city gone — fade to black
      f.style.background = '#000';
      f.style.opacity = Math.min(1, (t - 21.4) / .7);
    }
    const ttl = document.getElementById('story-title');  // DEFEND MANKIND on the black
    if (ttl) ttl.style.opacity =
      Math.max(0, Math.min(1, (t - 22.1) / .9)) * (t > 23.4 ? Math.max(0, 1 - (t - 23.4) / .6) : 1);

    // keyframed aerial — nest, charge, THE WALL, breakthrough, ultralisk rampage
    const KS = [
      [0.0, -70, 34, -205,   -70, 2, -258],
      [4.0, -72, 11, -228,   -70, 1, -260],
      [8.0, -56,  7, -150,   -20, 2, -80],
      [11.5, -20,  8, -26,     0, 2, 12],    // swoop in behind the wall
      [13.6,   0,  3.2, 16,    0, 1.5, -20], // low over the firing line — into the swarm
      [16.0,  14,  4,  8,      0, 1.5, 11],  // the line buckles
      [18.4, -18,  6,  2,      0, 3, 30],    // ultralisks hit the blocks
      [21.0,  10, 16, 58,      0, 3, 24],    // pull back over the burning city
      [23.8,  18, 20, 66,      0, 3, 24],
    ];
    let i = 0;
    while (i < KS.length - 2 && t >= KS[i + 1][0]) i++;
    const a = KS[i], b = KS[i + 1], k = _ez(Math.min(1, (t - a[0]) / (b[0] - a[0])));
    cam.position.set(_lz(a[1], b[1], k), _lz(a[2], b[2], k), _lz(a[3], b[3], k));
    this.look.set(_lz(a[4], b[4], k), _lz(a[5], b[5], k), _lz(a[6], b[6], k));
    cam.lookAt(this.look);

    // hives keep cooking while the camera flies
    if (t > 0.5) try { updateSpawners(dt); updateGibs(dt); } catch (e) {}

    // every ling on the field charges the pad — scuttle bob + leg flail
    for (const e of Enemies.list) {
      if (e.dead) continue;
      if (e.storyTgt === undefined) {
        e.storyTgt = { x: (Math.random() - .5) * 10, z: 10 + Math.random() * 3 };  // straight at the wall
        e.storySpd = 20 + Math.random() * 10;
        e.storyPh  = Math.random() * 7;
        e.storyBld = Math.floor(Math.random() * (this.storyCity.length || 1));
        e.storyJx  = Math.random() - .5;
        e.storyRet = 0;
        e.storyGo  = 9 + Math.random() * 4.5;            // staggered bloodlust — wall buckles man by man
      }
      const mp = e.mesh.position;
      if (e.sd) {                                        // shot dead — keel over, stay down
        e.mesh.rotation.x += (1.5 - e.mesh.rotation.x) * Math.min(1, dt * 6);
        mp.y += (-0.05 - mp.y) * Math.min(1, dt * 4);
        continue;
      }
      e.storyRet -= dt;
      if (t > 9.0 && e.storyRet <= 0) {                  // swarm hunts the wall, man by man
        e.storyRet = 0.7 + Math.random() * .5;
        let best = null, bd = 30;
        for (const mr of this.storyMarines) {
          if (mr.userData.fell) continue;
          const d = Math.hypot(mr.position.x - mp.x, mr.position.z - mp.z);
          if (d < bd) { bd = d; best = mr; }
        }
        e.storyMar = best;
      }
      if (t > 9.0 && e.storyMar && !e.storyMar.userData.fell) {
        e.storyTgt.x = e.storyMar.position.x; e.storyTgt.z = e.storyMar.position.z;
        if (Math.hypot(mp.x - e.storyTgt.x, mp.z - e.storyTgt.z) < 1.5) {
          e.storyMar.userData.fell = true;               // dragged down
          try {
            bloodBurst(mp.clone().setY(.6), 6);
            Audio2.hitAt(9); Audio2.screech(12);         // scream cut short
          } catch (e) {}
          e.storyMar = null;
        }
      } else if (t > 10.5) {                             // wall's gone — swarm the blocks
        const B = this.storyCity[e.storyBld];
        if (B && !B.fell) { e.storyTgt.x = B.bx + e.storyJx * 3; e.storyTgt.z = B.bz + (Math.random() - .5) * 3; }
        else { e.storyTgt.x = e.storyJx * 80; e.storyTgt.z = 20 + Math.random() * 36; }
      }
      const dx = e.storyTgt.x - mp.x, dz = e.storyTgt.z - mp.z, d = Math.hypot(dx, dz);
      if (d > 1.8) {
        mp.x += dx / d * e.storySpd * dt;
        mp.z += dz / d * e.storySpd * dt;
        e.mesh.rotation.y = Math.atan2(dx, dz);
        mp.y = Math.abs(Math.sin(t * 14 + e.storyPh)) * .12;   // grounded scuttle
      } else {                                           // scrabble at the walls — feet stay down
        mp.y += (.18 - mp.y) * Math.min(1, dt * 4);
        mp.x += Math.sin(t * 3 + e.storyPh) * dt * .5;
        mp.z += Math.cos(t * 2.4 + e.storyPh) * dt * .4;
      }
      const legs = e.mesh.userData.legs || [];
      for (let li = 0; li < legs.length; li++)
        legs[li].rotation.x = Math.sin(t * 16 + e.storyPh + li) * .5;
    }

    // horde facades → instance buffers (position/rot/scale all ride along)
    if (this.hordeIm) {
      for (const h of this.horde) {
        h.mesh.updateMatrix();
        this.hordeIm[0].setMatrixAt(h.im, h.mesh.matrix);
        this.hordeIm[1].setMatrixAt(h.im, h.mesh.matrix);
      }
      this.hordeIm[0].instanceMatrix.needsUpdate = true;
      this.hordeIm[1].instanceMatrix.needsUpdate = true;
    }

    // civilians scatter through the plaza — lings pull some of them down
    for (const c of this.storyCivs) {
      if (c.fell) { c.m.rotation.x += (1.5 - c.m.rotation.x) * Math.min(1, dt * 5); continue; }
      const cp = c.m.position;
      const dd = Math.hypot(c.tx - cp.x, c.tz - cp.z);
      if (dd < .6 || !c.tx) { c.tx = (Math.random() - .5) * 88; c.tz = 14 + Math.random() * 40; }
      cp.x += (c.tx - cp.x) / dd * c.spd * dt;
      cp.z += (c.tz - cp.z) / dd * c.spd * dt;
      cp.y = Math.abs(Math.sin(t * 12 + c.ph)) * .07;          // panicked scamper
      c.m.rotation.y = Math.atan2(c.tx - cp.x, c.tz - cp.z);
      if (t > 10)
        for (const e of Enemies.list)
          if (!e.sd && Math.hypot(e.mesh.position.x - cp.x, e.mesh.position.z - cp.z) < 1.1) {
            c.fell = true;
            try { bloodBurst(cp.clone().setY(.4), 4); } catch (e) {}
            break;
          }
    }

    // the wall fights like it's real — hold the line, track nearest ling, shoot
    for (let mi = 0; mi < this.storyMarines.length; mi++) {
      const m = this.storyMarines[mi], ud = m.userData;
      if (!ud.fell && t > 20.2) ud.fell = true;          // stragglers die with the city
      if (ud.fell) {
        m.rotation.x += (-1.45 - m.rotation.x) * Math.min(1, dt * 4);
        if (ud.kx) {                                     // ultra punt — skid to a stop
          m.position.x += ud.kx * dt; m.position.z += ud.kz * dt;
          ud.kx *= Math.max(0, 1 - dt * 4); ud.kz *= Math.max(0, 1 - dt * 4);
        }
        continue;
      }
      // acquire closest live ling
      let best = null, bd = 30;
      for (const e of Enemies.list) {
        if (e.dead || e.sd) continue;
        const d = Math.hypot(e.mesh.position.x - m.position.x, e.mesh.position.z - m.position.z);
        if (d < bd) { bd = d; best = e; }
      }
      ud.tgt = best;
      if (best) {
        const dx = best.mesh.position.x - m.position.x, dz = best.mesh.position.z - m.position.z;
        m.rotation.y = Math.atan2(dx, dz);                     // square up on it
        const fwd = ud.wall ? 0 : (bd < 5 ? -2.4 : (bd > 15 ? 1.8 : 0));  // the line holds
        if (Math.random() < dt * .6) ud.strafe *= -1;
        const side = ud.strafe * (bd < 14 ? 1.1 : .3);
        m.position.x += (Math.sin(m.rotation.y) * fwd + Math.cos(m.rotation.y) * side) * dt;
        m.position.z += (Math.cos(m.rotation.y) * fwd - Math.sin(m.rotation.y) * side) * dt;
        m.position.x = Math.max(-34, Math.min(34, m.position.x));
        m.position.z = Math.max(7.5, Math.min(14.5, m.position.z));       // along the line
        m.position.y = Math.abs(Math.sin(t * 10 + mi)) * .05;  // combat shuffle
        // open fire on its own rhythm
        ud.fireT = (ud.fireT || 0) - dt;
        if (ud.fireT <= 0 && t > 6.0) {
          ud.fireT = .2 + Math.random() * .26;
          const nrm = Math.hypot(dx, dz) || 1;
          const from = m.position.clone().add(new THREE.Vector3(dx / nrm * .5, 1.25, dz / nrm * .5));
          const geo = new THREE.BufferGeometry()
            .setFromPoints([from, best.mesh.position.clone().setY(.5)]);
          const ln = new THREE.Line(geo, new THREE.LineBasicMaterial({
            color: 0xffe8a0, transparent: true, opacity: .9 }));
          Enemies.scene.add(ln);
          this.storyFx.push({ m: ln, t: 0 });
          if (Math.random() < .25) { try { Audio2.shot(); } catch (e) {} }
        }
      } else if (!ud.wall) {                                       // nothing in range — patrol a little
        m.position.x += Math.sin(t * .8 + mi * 2.3) * dt * .6;
        m.position.z += Math.cos(t * .7 + mi * 1.9) * dt * .6;
      }
    }

    // THE ULTRALISKS ARRIVE — two of them, trampling the wall then the city
    if (t > 14.5 && !this.ultraGo) {
      this.ultraGo = true;
      try { Audio2.noise(1.6, .7, 70, .7); } catch (e) {}        // ground-shaking bellow
    }
    if (this.ultraGo) for (const u of this.storyUltras) {
      const up = u.m.position;
      // pick a standing block to flatten — prefer whatever's nearest
      if (!u.tgt || u.tgt.fell) {
        let best = null, bd = 60;
        for (const B of this.storyCity) {
          if (B.fell || B.far) continue;
          const d = Math.hypot(B.bx - up.x, B.bz - up.z);
          if (d < bd) { bd = d; best = B; }
        }
        u.tgt = best || { bx: (Math.random() - .5) * 50, bz: 20 + Math.random() * 30, fell: false };
      }
      const dx = u.tgt.bx - up.x, dz = u.tgt.bz - up.z, d = Math.hypot(dx, dz);
      if (d > 2.6) {
        up.x += dx / d * u.spd * dt;
        up.z += dz / d * u.spd * dt;
        u.m.rotation.y = Math.atan2(dx, dz);
        up.y = Math.abs(Math.sin(t * 8 + u.ph)) * .1;
      } else if (u.tgt.fell !== undefined) {
        u.tgt.fell = true; u.tgt.fallT = t;              // shoulders through the tower
        u.tgt.dir = dx >= 0 ? -1 : 1;
        try { Audio2.noise(1.4, .6, 90, .6); } catch (e) {}
        for (let i = 0; i < 4; i++) {                    // dust kicked off the collapse
          const p = new THREE.Mesh(new THREE.SphereGeometry(.5, 5, 4),
            new THREE.MeshBasicMaterial({ color: 0x140f0b, transparent: true, opacity: .5 }));
          p.position.set(u.tgt.bx + (Math.random() - .5) * 2, .7 + Math.random(),
                         u.tgt.bz + (Math.random() - .5) * 2);
          Enemies.scene.add(p);
          this.storyFx.push({ m: p, t: 0, ttl: 2.3, op: .5, vy: 1.7, grow: 1.1 });
        }
        u.tgt = null;
      }
      // trample marines and civs underfoot — punt the bodies
      for (const mr of this.storyMarines) {
        if (mr.userData.fell) continue;
        const ddx = mr.position.x - up.x, ddz = mr.position.z - up.z;
        if (ddx * ddx + ddz * ddz < 7.3) {
          mr.userData.fell = true;
          const k = 9 / (Math.hypot(ddx, ddz) || 1);
          mr.userData.kx = ddx * k; mr.userData.kz = ddz * k;
          try {
            bloodBurst(mr.position.clone().setY(.7), 6);
            Audio2.hitAt(7);                             // flattened under a hoof
          } catch (e) {}
        }
      }
      for (const c of this.storyCivs) {
        if (!c.fell && Math.hypot(c.m.position.x - up.x, c.m.position.z - up.z) < 2.2)
          c.fell = true;
      }
      const ulegs = u.m.userData.legs || [];
      for (let li = 0; li < ulegs.length; li++)
        ulegs[li].rotation.x = Math.sin(t * 9 + u.ph + li) * .4;
    }

    // blocks go down one by one — windows die, towers lean and sink in smoke
    for (const B of this.storyCity) {
      if (!B.fell && t > B.fallT) {
        B.fell = true; B.fallT = t;
        try { Audio2.noise(1.4, .5, 90, .6); } catch (e) {}
      }
      if (B.fell) {
        if (!B.lit) {                                  // ignite — ultras skip the timer but still burn
          B.lit = true;
          B.winMat.color.setHex(0xff5a12);             // windows burn, not just go dark
          B.fires = [];
          for (let fi = 0; fi < 2 + (B.h > 6 ? 1 : 0); fi++) {
            const fl = new THREE.Mesh(_flameGeo, _flameMat);
            fl.position.set((Math.random() - .5) * 1.3, B.h * (.5 + Math.random() * .45),
                            (Math.random() - .5) * 1.3);
            fl.scale.setScalar(.7 + Math.random() * .6);
            B.g.add(fl);                               // rides the wreck as it leans
            B.fires.push({ m: fl, s: fl.scale.y, ph: Math.random() * 7 });
          }
        }
        const k = Math.min(1, (t - B.fallT) / 1.8);
        B.g.rotation.z = B.dir * _ez(k) * (B.far ? .14 : .22);
        B.g.position.y = -_ez(k) * (B.h * (B.far ? .55 : .45));
        for (const fl of B.fires || [])                // flames lick and gutter
          fl.m.scale.y = fl.s * (.6 + Math.abs(Math.sin(t * 9 + fl.ph)) * .8);
      }
    }
    // fires + smoke over whatever has fallen
    if (t > 12.8) {
      if (this.storyFire) this.storyFire.intensity = 2 + Math.random() * 3.5;
      if (t > 13 && !this._boomed) {
        this._boomed = true;
        try { Audio2.noise(1.4, .5, 90, .6); } catch (e) {}
      }
      if (World.base) {
        const g = World.base.g, k = Math.min(1, (t - 12.8) / 2.6);
        g.rotation.z = _ez(k) * .34;
        g.position.y = .12 - _ez(k) * .7;
      }
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = .12;
        const src = this.storyCity.filter(b => b.fell);
        const at = src.length ? src[Math.floor(Math.random() * src.length)] : null;
        if (at && this.cityGlow) {                     // firelight over the burning block
          this.cityGlow.position.set(at.bx, Math.max(2, at.g.position.y + at.h * .7), at.bz);
          this.cityGlow.intensity = 3 + Math.random() * 4;
        }
        const p = new THREE.Mesh(new THREE.SphereGeometry(.5, 5, 4),
          new THREE.MeshBasicMaterial({ color: 0x140f0b, transparent: true, opacity: .55 }));
        p.position.set((at ? at.bx : 0) + (Math.random() - .5) * 2,
          (at ? Math.max(.5, at.g.position.y + at.h) : 1.7) + Math.random(),
          (at ? at.bz : 18) + (Math.random() - .5) * 2);
        Enemies.scene.add(p);
        this.storyFx.push({ m: p, t: 0, ttl: 2.3, op: .55, vy: 1.7, grow: 1.1 });
      }
    }

    // kills land where someone's actually aiming — the wall SHREDS the first waves
    if (t > 6.0 && t < 20.5) {
      this.killT -= dt;
      if (this.killT <= 0) {
        this.killT = 0.07 + Math.random() * .05;
        const shooters = this.storyMarines.filter(m => !m.userData.fell && m.userData.tgt);
        for (let k = 0; k < Math.min(4, shooters.length); k++) {
          const v = shooters.splice(Math.floor(Math.random() * shooters.length), 1)[0].userData.tgt;
          if (v.sd) continue;
          v.sd = true;
          try { bloodBurst(v.mesh.position.clone().setY(.4), 6); } catch (e) {}
        }
      }
    }
    for (const x of this.storyFx) {
      x.t += dt;
      if (x.vy) x.m.position.y += x.vy * dt;
      if (x.grow) x.m.scale.multiplyScalar(1 + dt * x.grow);
      x.m.material.opacity = (x.op || .9) * Math.max(0, 1 - x.t / (x.ttl || .1));
      if (x.t > (x.ttl || .1)) { Enemies.scene.remove(x.m); x.done = true; }
    }
    this.storyFx = this.storyFx.filter(x => !x.done);

    if (t >= 24.2) this.stop();
  },

  /* walk in and look around — mouse steers the head, no pointer lock */
  visit() {
    if (!this.scene) this.build();
    if (!this.cam)
      this.cam = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .05, 60);
    else this.cam.aspect = innerWidth / innerHeight, this.cam.updateProjectionMatrix();
    this.visiting = true; this.menu = false;
    this.suitFor(Game.unit || 'marine');                 // YOUR rig is the one on the rack
    this.billetSquad();                                            // squad stands to
    this.vYaw = this.vYawT = Math.PI;                    // start facing the suit rack
    this.vPitch = this.vPitchT = 0;
    this.vPos.set(0, 0, 2.4); this.bobT = 0; this.vY = 0;
    Audio2.ensure();                                   // boots-on-deck sound
    if (!this._vRay) this._vRay = new THREE.Raycaster();
    if (!this._vNdc) this._vNdc = new THREE.Vector2();
    if (this._vMove) document.removeEventListener('mousemove', this._vMove);
    this._vMove = e => {
      // deltas work with or without pointer lock — instant like the fight
      this.vYaw = this.vYawT += e.movementX * 0.0022;
      this.vPitch = this.vPitchT =
        Math.max(-1.45, Math.min(1.45, this.vPitchT - e.movementY * 0.0022));
    };
    document.addEventListener('mousemove', this._vMove);
    if (!this._vClick) this._vClick = () => {
      if (this._suitHot && this.onSuitTap) this.onSuitTap();   // looking at the rig = its button
    };
    document.addEventListener('mousedown', this._vClick);
    this._suitHot = false;
    document.getElementById('intro-fade').style.opacity = 0;
    const bh = document.getElementById('barracks-hint');
    if (bh) bh.classList.add('hidden');
    Game.renderer.domElement.requestPointerLock();     // mouse locks in like the fight
  },

  leave() {
    this.visiting = false;
    if (this._vMove) { document.removeEventListener('mousemove', this._vMove); this._vMove = null; }
    if (this._vClick) document.removeEventListener('mousedown', this._vClick);
    document.body.style.cursor = '';
    const bh = document.getElementById('barracks-hint');
    if (bh) bh.classList.add('hidden');
    document.exitPointerLock && document.exitPointerLock();
    this.setChest(0);                                  // rig reseals, core back to idle glow
    this.show();                                       // hand the camera back to the drift
  },

  play(cb) {
    if (this.playing) return;
    if (this.visiting) this.leave();         // can't be mid-tour when the drop goes
    if (!this.scene) this.build();
    if (!this.cam)
      this.cam = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .05, 60);
    else this.cam.aspect = innerWidth / innerHeight, this.cam.updateProjectionMatrix();
    this.playing = true; this.menu = false; this.armed = false;
    this.t = 0; this.cb = cb;
    // reset animatables
    this.setChest(0);
    this.door.position.y = 1.35;
    this.doorGlow.material.opacity = .06;
    this.outLight.intensity = 0;
    this.base.visible = true; this.base.position.y = .12;
    this.billetSquad();                                            // squad back in ranks
    this.cam.position.set(0, 1.55, 4.6);
    this.look.set(0, 1.3, .3);
    // overlay: bars + boot lines (revealed on schedule) + skip hint
    const st = document.getElementById('storyscreen');
    st.classList.remove('hidden');
    document.getElementById('story-text').style.display = '';
    document.getElementById('story-skip').textContent = 'CLICK OR PRESS ANY KEY TO DEPLOY \u25B8';
    document.querySelectorAll('.st-line').forEach(l => l.style.opacity = 0);
    document.getElementById('intro-visor').style.opacity = 0;
    const f = document.getElementById('intro-fade');
    f.style.background = '#000'; f.style.opacity = 1;
    Audio2.ensure && Audio2.ensure();
    // skip — any click/key once armed (0.7s so the opening click doesn't skip)
    this._skip = () => { if (this.armed) this.stop(); };
    setTimeout(() => { this.armed = true; }, 700);
    document.addEventListener('keydown', this._skip);
    document.addEventListener('mousedown', this._skip);
  },

  stop() {
    this.playing = false; this.menu = false; this.visiting = false; this.story = false;
    for (const m of this.storyMarines) Enemies.scene.remove(m);   // pad set-dressing
    for (const u of this.storyUltras || []) Enemies.scene.remove(u.m);
    for (const x of this.storyFx) Enemies.scene.remove(x.m);
    if (this.hordeIm) {
      for (const im of this.hordeIm) {
        Enemies.scene.remove(im); im.dispose();
        im.geometry.dispose(); im.material.dispose();
      }
      this.hordeIm = null;
    }
    this.horde = [];
    this.storyMarines = []; this.storyUltras = []; this.storyFx = [];
    if (this.storyFire) { Enemies.scene.remove(this.storyFire); this.storyFire = null; }
    if (this.cityGlow) { Enemies.scene.remove(this.cityGlow); this.cityGlow = null; }
    for (const B of this.storyCity) Enemies.scene.remove(B.g);
    for (const c of this.storyCivs) Enemies.scene.remove(c.m);
    this.storyCity = []; this.storyCivs = [];
    if (World.base) resetBaseLift();                   // un-scorch the ride home
    const tt = document.getElementById('story-title'); if (tt) tt.style.opacity = 0;
    if (Enemies.list.length) {                                   // story extras — fresh field for the game
      for (const e of Enemies.list) Enemies.scene.remove(e.mesh);
      Enemies.list = [];
    }
    spawnQueue.length = 0;                                       // nothing hatches posthumously
    document.removeEventListener('keydown', this._skip);
    document.removeEventListener('mousedown', this._skip);
    if (this._vMove) document.removeEventListener('mousemove', this._vMove);
    if (this._vClick) document.removeEventListener('mousedown', this._vClick);
    document.body.style.cursor = '';
    const bh = document.getElementById('barracks-hint');
    if (bh) bh.classList.add('hidden');
    document.exitPointerLock && document.exitPointerLock();
    document.getElementById('storyscreen').classList.add('hidden');
    document.getElementById('intro-visor').style.opacity = 0;
    const f = document.getElementById('intro-fade');
    f.style.opacity = 0; f.style.background = '#fff';
    const cb = this.cb; this.cb = null;
    if (cb) cb();
  },

  update(dt) {
    if (this.story) { this.storyUpdate(dt); return; }
    if (this.visiting) {                     // free-look visit — head follows the mouse
      this.menuT += dt;
      const t = this.menuT;
      // WASD walk — same legs as the field: 6.0 walk, 9.2 sprint, Space jumps
      const p = this.vPos,
        sprint = KEYS['shift'],
        mv = ((KEYS['w'] || KEYS['arrowup']) ? 1 : 0) - ((KEYS['s'] || KEYS['arrowdown']) ? 1 : 0),
        st = ((KEYS['d'] || KEYS['arrowright']) ? 1 : 0) - ((KEYS['a'] || KEYS['arrowleft']) ? 1 : 0);
      if (mv || st) {
        const sp = (sprint ? 9.2 : 6.0) * dt;
        p.x += (Math.sin(this.vYaw) * mv + Math.cos(this.vYaw) * st) * sp;
        p.z += (Math.cos(this.vYaw) * mv - Math.sin(this.vYaw) * st) * sp;
        this.bobT += dt * (sprint ? 11 : 8);
        this.stepT -= dt;
        if (p.y <= 0 && this.stepT <= 0) {
          this.stepT = sprint ? 0.28 : 0.4; Audio2.step();
        }
      }
      if (KEYS[' '] && p.y <= 0) { this.vY = 5.4; Audio2.jump(); }
      this.vY -= 16 * dt; p.y += this.vY * dt;
      if (p.y <= 0) { p.y = 0; this.vY = 0; }
      p.z = Math.max(-13.4, Math.min(9.4, p.z));
      if (p.z > 5.2 && Math.abs(p.x) > 0.68) p.z = 5.2;      // doorway funnel
      if (p.z < -5.2 && Math.abs(p.x) > 2.6) p.z = -5.2;     // bay mouth
      if (p.z > 5.2) p.x = Math.max(-0.68, Math.min(0.68, p.x));
      else if (p.z >= -5.2) p.x = Math.max(-5.3, Math.min(5.3, p.x));
      else p.x = Math.max(-6.3, Math.min(6.3, p.x));         // apron
      const sdx = p.x, sdz = p.z + 0.2, sd = sdx * sdx + sdz * sdz; // don't clip the rig
      if (sd < 0.30 && p.z >= -5.2 && p.z <= 5.2) {
        const d = Math.sqrt(sd) || .01, k = 0.55 / d;
        p.x = sdx * k; p.z = -0.2 + sdz * k;
      }
      const bob = (mv || st) ? Math.sin(this.bobT * 2) * .03 : Math.sin(t * .9) * .02;
      this.cam.position.set(p.x, 1.62 + p.y + bob, p.z);
      const cy = Math.cos(this.vPitch);
      this.look.set(p.x + Math.sin(this.vYaw) * cy * 5,
                    1.62 + p.y + Math.sin(this.vPitch) * 5,
                    p.z + Math.cos(this.vYaw) * cy * 5);
      this.cam.lookAt(this.look);
      // staring at your rig → it glows as the deploy button
      this._vRay.setFromCamera(this._vNdc.set(0, 0), this.cam);
      const hot = this._vRay.intersectObject(this.suit, true).length > 0;
      if (hot !== this._suitHot) {
        this._suitHot = hot;
        const h = document.getElementById('barracks-hint');
        if (h) h.classList.toggle('hidden', !hot);
      }
      if (this.core) this.core.material.emissiveIntensity =
        .3 + (this._suitHot ? 1.6 + Math.sin(t * 6) * .8 : Math.sin(t * 2) * .3 + .3);
      this.squadUpdate(dt, t, false);
      return;
    }
    if (this.menu && !this.playing) {          // menu backdrop — drift inside the barracks
      this.menuT += dt;
      const t = this.menuT;
      this.cam.position.set(Math.sin(t * .11) * 2.4, 1.52 + Math.sin(t * .23) * .1,
        3.3 + Math.cos(t * .09) * .7);
      this.look.set(Math.sin(t * .07) * .6, 1.25, -.4 + Math.sin(t * .05) * .9);
      this.cam.lookAt(this.look);
      this.squadUpdate(dt, t, false);                              // squad idles in ranks
      return;
    }
    if (!this.playing) return;
    this.t += dt;
    const t = this.t, cam = this.cam, fade = document.getElementById('intro-fade');

    // boot-line reveal schedule (suit OS posting during the 5s seal)
    const LINES = [5.1, 5.9, 6.7, 7.5];
    const lines = document.querySelectorAll('.st-line');
    LINES.forEach((lt, i) => {
      if (t >= lt && t - dt < lt && lines[i]) {
        lines[i].style.opacity = 1;
        Audio2.radio();
      }
    });

    if (t < 2.6) {                                   // — walk up to the suit —
      const k = _ez(t / 2.6);
      cam.position.set(0, _lz(1.55, 1.42, k), _lz(4.6, 1.15, k));
      this.look.set(0, 1.25, .25);
      fade.style.opacity = 1 - Math.min(1, t / .8);  // fade in from black
      // chest irises open as you arrive — hydraulics crack the four corner plates
      if (t - dt < 1.3 && t >= 1.3) Audio2.hydraulic();
      this.setChest(_ez(Math.min(1, Math.max(0, (t - 1.3) / .9))));
    } else if (t < 4.0) {                            // — step in, turn to the door —
      const k = _ez((t - 2.6) / 1.4);
      cam.position.set(0, _lz(1.42, 1.3, k), _lz(1.15, .02, k));
      this.look.set(0, _lz(1.25, 1.5, k), _lz(.25, 8, k));
    } else if (t < 4.7) {                            // — chest seals shut —
      const k = _ez((t - 4.0) / .7);
      this.setChest(1 - k);
      if (t - dt < 4.0) Audio2.tone(70, .25, 'square', .25, 40);   // heavy clunk
      if (t - dt < 4.4 && t >= 4.4) Audio2.noise(.2, .15, 900, 1); // pneumatic seal
      const v = document.getElementById('intro-visor');
      v.style.opacity = Math.min(1, (t - 4.0) / .5);
    } else if (t < 8.6) {                            // — inside: suit boot —
      cam.position.set(0, 1.3 + Math.sin(t * 1.4) * .006, .02);    // idle breath sway
      if (t - dt < 4.7) Audio2.tone(120, .3, 'sine', .1, 60);      // suit hum on
      if (t - dt < 5.0 && t >= 5.0) Audio2.say('Suit sealed. All systems nominal.', { rate: .95 });
      // glance back at the pad — your ride waits — then square on the door
      let lz = 8;
      if (t >= 5.6 && t < 6.3) lz = _lz(8, -10, _ez((t - 5.6) / .7));
      else if (t >= 6.3 && t < 7.7) lz = -10;
      else if (t >= 7.7) lz = _lz(-10, 8, _ez(Math.min(1, (t - 7.7) / .6)));
      this.look.set(0, 1.5, lz);
      if (t - dt < 6.4 && t >= 6.4)
        Audio2.say('Command center holding on the pad.', { rate: .95 });
    } else if (t < 10.2) {                           // — barracks door opens —
      const k = _ez((t - 8.6) / 1.6);
      this.door.position.y = _lz(1.35, 4.05, k);
      this.doorGlow.material.opacity = _lz(.06, 1, k);
      this.outLight.intensity = _lz(0, 2.2, k);
      if (t - dt < 8.6) Audio2.noise(.8, .2, 300, .7);             // servo rumble
    } else if (t < 12.6) {                           // — walk out the door —
      const k = _ez((t - 10.2) / 2.4);
      cam.position.set(0, 1.3, _lz(.02, 7.6, k));
      this.look.set(0, 1.5, 12);
      if (t > 11.4) {                                // white-out into the drop
        fade.style.background = '#fff';
        fade.style.opacity = Math.min(1, (t - 11.4) / 1.1);
      }
    } else this.stop();

    this.suitUpSquad(t);                         // armor slams on, one rig at a time
    this.squadUpdate(dt, t, t > 8.6);            // door opens — the squad files out ahead of you
    cam.lookAt(this.look);
  },
};
