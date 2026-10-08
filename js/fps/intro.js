/* ============================================================
   intro.js — suit-up cinematic: barracks room, CMC armor on a
   rack, chest opens, you step in, it seals, suit boots (~5s),
   the barracks door opens, you walk out to the fight.
   Renders its own scene/camera while Intro.playing is true.
   ============================================================ */

const _ez = x => x * x * (3 - 2 * x);           // smoothstep
const _lz = (a, b, x) => a + (b - a) * x;

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
    // guaranteed burst at the two southern hives the camera visits
    for (const s of World.spawners.slice(2)) {
      for (let i = 0; i < 6; i++) {
        const p = s.pos.clone();
        p.x += (Math.random() - .5) * 7; p.z += (Math.random() - .5) * 7;
        spawnEnemy('zergling', p);
      }
    }
    // the city — tower blocks ringing the pad, windows lit before they die
    this.storyCity = [];
    const BLOCS = [
      [-9, 9.5], [-5.5, 11], [7.5, 10], [11, 14.5], [-11.5, 15], [12.5, 19],
      [-8, 24.5], [7, 25.5], [-4.5, 28.5], [4.5, 28.5], [-13, 20], [13, 24],
    ];
    for (const [bx, bz] of BLOCS) {
      const h = 2.4 + Math.random() * 4.2, w = 1.8 + Math.random() * 1.5;
      const g = new THREE.Group();
      const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, w),
        new THREE.MeshStandardMaterial({ color: 0x232e3a, roughness: .8, metalness: .3 }));
      tower.position.y = h / 2; g.add(tower);
      const winMat = new THREE.MeshBasicMaterial({ color: 0x64d8ff });   // lit windows
      for (let wy = .7; wy < h - .3; wy += 1.05) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(w * .78, .1, .02), winMat);
        s.position.set(0, wy, w / 2 + .015); g.add(s);
      }
      g.position.set(bx, 0, bz);
      Enemies.scene.add(g);
      this.storyCity.push({ g, winMat, h, bx, bz,
        fallT: 13.2 + Math.random() * 3.2, dir: Math.random() < .5 ? -1 : 1, fell: false });
    }

    // defenders all over the streets — marines + marauders, all doomed
    this.storyMarines = [];
    const LINE = [
      [-5.5, 12.5, 'mar'], [4.5, 11.5, 'mar'], [-9.5, 15.5, 'rau'], [9.5, 16, 'rau'],
      [-1.7, 13.8, 'mar'], [1.7, 13.8, 'mar'], [-0.7, 16.2, 'mar'], [0.8, 16.4, 'rau'],
      [-7, 20.5, 'mar'], [7.5, 21, 'mar'], [-3, 25.5, 'mar'], [3.2, 26, 'mar'],
      [-0.5, 18.3, 'mar'], [0.6, 17.7, 'mar'],                             // on the hull — doomed last
    ];
    for (let i = 0; i < LINE.length; i++) {
      const [mx, mz, kind] = LINE[i];
      const onDeck = mz > 17;
      const m = (kind === 'rau' ? buildMarauderMesh : buildMarineMesh)(0x4ad0ff);
      m.position.set(mx, onDeck ? 2.3 : 0, mz);
      m.rotation.y = Math.PI + (Math.random() - .5) * .3;
      for (const k of ['barBg', 'barFg', 'star']) if (m.userData[k]) m.userData[k].visible = false;
      m.userData.fallT = 11.8 + i * .34 + Math.random() * .3;
      m.userData.onDeck = onDeck;
      Enemies.scene.add(m);
      this.storyMarines.push(m);
    }

    // civilians loose in the plaza — running, screaming, some don't make it
    this.storyCivs = [];
    for (let i = 0; i < 9; i++) {
      const m = this.civMesh();
      m.position.set((Math.random() - .5) * 16, 0, 8 + Math.random() * 18);
      Enemies.scene.add(m);
      this.storyCivs.push({ m, tx: 0, tz: 0, spd: 4 + Math.random() * 2.4, fell: false, ph: Math.random() * 7 });
    }
    if (World.base) {                                    // wreck state + fire light
      World.base.g.rotation.set(0, 0, 0); World.base.g.position.y = .12;
      this.storyFire = new THREE.PointLight(0xff6a22, 0, 14);
      this.storyFire.position.set(0, 1.6, 18);
      Enemies.scene.add(this.storyFire);
    }
    this.smokeT = 0; this._boomed = false; this.killT = 0;
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
    else if (t > 17.0) {                                 // city gone — fade to black
      f.style.background = '#000';
      f.style.opacity = Math.min(1, (t - 17.0) / .7);
    }
    const ttl = document.getElementById('story-title');  // DEFEND MANKIND on the black
    if (ttl) ttl.style.opacity =
      Math.max(0, Math.min(1, (t - 17.6) / .9)) * (t > 18.9 ? Math.max(0, 1 - (t - 18.9) / .6) : 1);

    // keyframed aerial — nest, swarm charge, over the rooftops, city burns
    const KS = [
      [0.0, -70, 34, -205,   -70, 2, -258],
      [4.0, -72, 11, -228,   -70, 1, -260],
      [8.0, -56,  7, -150,   -20, 2, -80],
      [11.5, -14,  9, -30,     0, 3, 14],    // over the rooftops, wave rolls in
      [14.0,  9,  5,  30,      0, 2, 16],    // street-level battle
      [16.4,  5,  2.8, 24,     0, 1.4, 17],  // close on the burn
      [18.4,  6,  9,  32,      0, 2, 16],    // pull back over the burning city
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
        e.storyTgt = { x: (Math.random() - .5) * 8, z: 14 + Math.random() * 4 };
        e.storySpd = 20 + Math.random() * 10;
        e.storyPh  = Math.random() * 7;
        e.storyBld = Math.floor(Math.random() * (this.storyCity.length || 1));
        e.storyJx  = Math.random() - .5;
      }
      const mp = e.mesh.position;
      if (e.sd) {                                        // shot dead — keel over, stay down
        e.mesh.rotation.x += (1.5 - e.mesh.rotation.x) * Math.min(1, dt * 6);
        mp.y += (-0.05 - mp.y) * Math.min(1, dt * 4);
        continue;
      }
      if (t > 10.5) {                                    // swarm breaks up over the city blocks
        const B = this.storyCity[e.storyBld];
        if (B) { e.storyTgt.x = B.bx + e.storyJx * 3; e.storyTgt.z = B.bz + (Math.random() - .5) * 3; }
        else { e.storyTgt.x = e.storyJx * 4.4; e.storyTgt.z = 18 + e.storyJx * 3; }
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

    // defenders trade kills — the pack takes losses before it wins
    if (t > 7.5 && t < 15) {
      this.killT -= dt;
      if (this.killT <= 0) {
        this.killT = 0.55 + Math.random() * .4;
        const prey = Enemies.list.filter(e => !e.sd && e.mesh.position.z > -40);
        if (prey.length) {
          const v = prey[Math.floor(Math.random() * prey.length)];
          v.sd = true;
          try { bloodBurst(v.mesh.position.clone().setY(.4), 5); } catch (e) {}
        }
      }
    }

    // civilians scatter through the plaza — lings pull some of them down
    for (const c of this.storyCivs) {
      if (c.fell) { c.m.rotation.x += (1.5 - c.m.rotation.x) * Math.min(1, dt * 5); continue; }
      const cp = c.m.position;
      const dd = Math.hypot(c.tx - cp.x, c.tz - cp.z);
      if (dd < .6 || !c.tx) { c.tx = (Math.random() - .5) * 20; c.tz = 6 + Math.random() * 22; }
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

    // crew get swarmed one by one — they tip over as the pack reaches them
    for (const m of this.storyMarines) {
      const ud = m.userData;
      if (t > ud.fallT) ud.fell = true;
      if (ud.fell) m.rotation.x += (-1.45 - m.rotation.x) * Math.min(1, dt * 4);
      if (ud.onDeck && World.base)
        m.position.y = 2.3 + (World.base.g.position.y - .12);   // ride the deck down
    }

    // blocks go down one by one — windows die, towers lean and sink in smoke
    for (const B of this.storyCity) {
      if (!B.fell && t > B.fallT) {
        B.fell = true;
        B.winMat.color.setHex(0x1a1208);                   // lights out
        try { Audio2.noise(1.4, .5, 90, .6); } catch (e) {}
      }
      if (B.fell) {
        const k = Math.min(1, (t - B.fallT) / 1.8);
        B.g.rotation.z = B.dir * _ez(k) * .22;
        B.g.position.y = -_ez(k) * (B.h * .45);
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
        const p = new THREE.Mesh(new THREE.SphereGeometry(.5, 5, 4),
          new THREE.MeshBasicMaterial({ color: 0x140f0b, transparent: true, opacity: .55 }));
        p.position.set((at ? at.bx : 0) + (Math.random() - .5) * 2,
          (at ? Math.max(.5, at.g.position.y + at.h) : 1.7) + Math.random(),
          (at ? at.bz : 18) + (Math.random() - .5) * 2);
        Enemies.scene.add(p);
        this.storyFx.push({ m: p, t: 0, ttl: 2.3, op: .55, vy: 1.7, grow: 1.1 });
      }
    }

    // pad marines open up once the pack gets close
    if (t > 7.5) {
      this.fxT -= dt;
      if (this.fxT <= 0) {
        this.fxT = 0.22 + Math.random() * .18;
        const standing = this.storyMarines.filter(m => !m.userData.fell);
        const mar = standing.length && standing[Math.floor(Math.random() * standing.length)];
        const live = Enemies.list.filter(e => !e.dead && e.mesh.position.z > -60);
        if (mar && live.length) {
          const tgt = live[Math.floor(Math.random() * live.length)].mesh.position;
          const from = mar.position.clone().add(new THREE.Vector3(0, 1.3, 0.5));
          const geo = new THREE.BufferGeometry().setFromPoints([from, tgt.clone().setY(.5)]);
          const ln = new THREE.Line(geo, new THREE.LineBasicMaterial({
            color: 0xffe8a0, transparent: true, opacity: .9 }));
          Enemies.scene.add(ln);
          this.storyFx.push({ m: ln, t: 0 });
          try { Audio2.shot(); } catch (e) {}
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

    if (t >= 19.4) this.stop();
  },

  /* walk in and look around — mouse steers the head, no pointer lock */
  visit() {
    if (!this.scene) this.build();
    if (!this.cam)
      this.cam = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .05, 60);
    else this.cam.aspect = innerWidth / innerHeight, this.cam.updateProjectionMatrix();
    this.visiting = true; this.menu = false;
    this.suitFor(Game.unit || 'marine');                 // YOUR rig is the one on the rack
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
    for (const x of this.storyFx) Enemies.scene.remove(x.m);
    this.storyMarines = []; this.storyFx = [];
    if (this.storyFire) { Enemies.scene.remove(this.storyFire); this.storyFire = null; }
    for (const B of this.storyCity) Enemies.scene.remove(B.g);
    for (const c of this.storyCivs) Enemies.scene.remove(c.m);
    this.storyCity = []; this.storyCivs = [];
    if (World.base) { World.base.g.rotation.set(0, 0, 0); World.base.g.position.y = .12; }
    const tt = document.getElementById('story-title'); if (tt) tt.style.opacity = 0;
    if (Enemies.list.length) {                                   // story extras — fresh field for the game
      for (const e of Enemies.list) Enemies.scene.remove(e.mesh);
      Enemies.list = [];
    }
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
      return;
    }
    if (this.menu && !this.playing) {          // menu backdrop — drift inside the barracks
      this.menuT += dt;
      const t = this.menuT;
      this.cam.position.set(Math.sin(t * .11) * 2.4, 1.52 + Math.sin(t * .23) * .1,
        3.3 + Math.cos(t * .09) * .7);
      this.look.set(Math.sin(t * .07) * .6, 1.25, -.4 + Math.sin(t * .05) * .9);
      this.cam.lookAt(this.look);
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
      // chest irises open as you arrive — servo whine first
      if (t - dt < 1.3 && t >= 1.3) {
        Audio2.noise(.55, .18, 700, .7);
        Audio2.tone(300, .5, 'triangle', .08, 700);
      }
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

    cam.lookAt(this.look);
  },
};
