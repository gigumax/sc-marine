/* ============================================================
   intro.js — suit-up cinematic: barracks room, CMC armor on a
   rack, chest opens, you step in, it seals, suit boots (~5s),
   the barracks door opens, you walk out to the fight.
   Renders its own scene/camera while Intro.playing is true.
   ============================================================ */

const _ez = x => x * x * (3 - 2 * x);           // smoothstep
const _lz = (a, b, x) => a + (b - a) * x;

const Intro = {
  playing: false, t: 0, cb: null,
  scene: null, cam: null,
  chest: null, door: null, doorGlow: null, outLight: null,
  look: new THREE.Vector3(), armed: false,

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
    // back wall — wide hangar gap so the pad/base outside stays in view
    B(3, 4, .2, wall, -4.5, 2, -6);
    B(3, 4, .2, wall, 4.5, 2, -6);
    B(6, .6, .2, wall, 0, 3.7, -6);
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
    apron.rotation.x = -Math.PI / 2; apron.position.set(0, .012, -11); s.add(apron);
    B(4.4, .12, 4.4, joint, 0, .06, -11.5);             // landing pad
    B(.12, .02, 4.4, glowC, -2.1, .125, -11.5);         // pad edge lights
    B(.12, .02, 4.4, glowC, 2.1, .125, -11.5);
    const glowO = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
    const base = this.base = new THREE.Group(); base.position.set(0, .12, -11.5); s.add(base);
    B(2.6, .5, 2.2, wall, 0, .37, 0, base);             // skirt
    B(2.1, 1.1, 1.7, armor, 0, 1.15, 0, base);          // hull
    B(1.5, .6, 1.2, armorD, 0, 1.95, 0, base);          // upper deck
    B(.6, .35, .6, armor, 0, 2.35, 0, base);            // crown
    B(.06, 1, .06, joint, .8, 2.4, 0, base);            // antenna
    B(.1, .1, .1, glowC, .8, 2.95, 0, base);            // beacon
    B(1.6, .06, .02, glowC, 0, 1.0, .86, base);         // window strips
    B(1.6, .06, .02, glowC, 0, 1.35, .86, base);
    for (const lx of [-1.05, 1.05]) for (const lz of [-.8, .8])
      B(.2, .4, .2, joint, lx, .2, lz, base);           // landing legs
    this.thrusters = new THREE.Group(); base.add(this.thrusters);
    for (const tx of [-.8, 0, .8])
      B(.34, .2, .34, glowO, tx, -.16, 0, this.thrusters);
    this.thrusters.visible = false;
    this.baseLight = new THREE.PointLight(0x6aa8ff, .8, 18);
    this.baseLight.position.set(0, 3, -9.5); s.add(this.baseLight);
    // warp-out streak — flat flash column where the base stood
    this.warp = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 9),
      new THREE.MeshBasicMaterial({ color: 0xaee4ff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.warp.position.set(0, 4.5, -11.5); this.warp.visible = false; s.add(this.warp);
    // dust puff pool — sprites with a soft radial texture, reused per liftoff
    const dc = document.createElement('canvas'); dc.width = dc.height = 64;
    const dg = dc.getContext('2d');
    const grad = dg.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(190,170,140,.65)');
    grad.addColorStop(1, 'rgba(190,170,140,0)');
    dg.fillStyle = grad; dg.fillRect(0, 0, 64, 64);
    const dustTex = new THREE.CanvasTexture(dc);
    this.dust = [];
    for (let i = 0; i < 16; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: dustTex, transparent: true, opacity: 0, depthWrite: false }));
      sp.visible = false; s.add(sp);
      this.dust.push({ m: sp, vel: new THREE.Vector3(), t: 0, life: 0 });
    }

    /* --- the CMC suit on its rack — the real battle mesh, front (+z) out --- */
    const suit = new THREE.Group(); s.add(suit);
    B(.5, .08, .5, joint, 0, .04, -.2, suit);                       // rack base
    B(.1, 1.9, .1, joint, 0, .95, -.48, suit);                      // rack post
    B(.14, .3, .14, joint, 0, 1.75, -.42, suit);                    // head mount
    B(.1, .2, .3, joint, -.34, 1.5, -.3, suit);                     // shoulder clamps
    B(.1, .2, .3, joint, .34, 1.5, -.3, suit);

    const body = buildMarineMesh(0x4ad0ff);                         // battle suit, cyan trim
    const gun = body.children.find(c => c.isGroup);                 // rifle stays on the rack's rack
    if (gun) body.remove(gun);
    body.userData.barBg.visible = body.userData.barFg.visible = false;
    suit.add(body);

    // dark entry cavity the panels reveal + a lit core to sell the tech
    B(.5, .66, .05, dark, 0, 1.18, .2, body);
    const core = B(.16, .16, .03, glowC, 0, 1.18, .215, body);
    core.material = core.material.clone();
    this.core = core;

    /* chest = four panels, each pivots on the diagonal axis of its own
       corner — they iris open like a high-tech hatch */
    this.panels = [];
    for (const [cx, cy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(cx * .135, 1.18 + cy * .17, .27);
      pivot.userData.axis = new THREE.Vector3(cx, cy, 0).normalize();
      const plate = B(.26, .33, .06, armor, 0, 0, 0, pivot);
      plate.material = plate.material.clone();
      plate.material.color.setHex(0x36495e);
      B(.05, .05, .065, glowC, -cx * .06, -cy * .08, 0, pivot);     // corner light
      body.add(pivot);
      this.panels.push(pivot);
    }
    this.setChest(1);                                               // start open
  },

  /* 1 = iris fully open, 0 = sealed shut */
  setChest(open) {
    const ang = open * 1.85;
    for (const p of this.panels)
      p.quaternion.setFromAxisAngle(p.userData.axis, ang);
    if (this.core) this.core.material.emissiveIntensity = .3 + open * 2.2;
  },

  /* ---------- run ---------- */
  play(cb) {
    if (this.playing) return;
    if (!this.scene) this.build();
    if (!this.cam)
      this.cam = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .05, 60);
    else this.cam.aspect = innerWidth / innerHeight, this.cam.updateProjectionMatrix();
    this.playing = true; this.armed = false;
    this.t = 0; this.cb = cb;
    // reset animatables
    this.setChest(1);
    this.door.position.y = 1.35;
    this.doorGlow.material.opacity = .06;
    this.outLight.intensity = 0;
    this.base.visible = true; this.base.position.y = .12;
    this.thrusters.visible = false;
    this.warp.visible = false; this.warp.material.opacity = 0;
    for (const p of this.dust) { p.life = 0; p.m.visible = false; }
    this.cam.position.set(0, 1.55, 4.6);
    this.look.set(0, 1.3, .3);
    // overlay: bars + boot lines (revealed on schedule) + skip hint
    const st = document.getElementById('storyscreen');
    st.classList.remove('hidden');
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
    this.playing = false;
    document.removeEventListener('keydown', this._skip);
    document.removeEventListener('mousedown', this._skip);
    document.getElementById('storyscreen').classList.add('hidden');
    document.getElementById('intro-visor').style.opacity = 0;
    const f = document.getElementById('intro-fade');
    f.style.opacity = 0; f.style.background = '#fff';
    const cb = this.cb; this.cb = null;
    if (cb) cb();
  },

  /* ring of dust sprites blasted out from under the pad */
  kickDust() {
    const n = this.dust.length;
    for (let i = 0; i < n; i++) {
      const p = this.dust[i], a = i / n * Math.PI * 2 + Math.random() * .4;
      p.t = 0; p.life = 1.4 + Math.random() * .9;
      p.m.visible = true;
      p.m.position.set(this.base.position.x + Math.cos(a) * 1.7, .15,
                       this.base.position.z + Math.sin(a) * 1.7);
      p.vel.set(Math.cos(a) * (2.5 + Math.random() * 2.5),
                .8 + Math.random() * 1.6,
                Math.sin(a) * (2.5 + Math.random() * 2.5));
      p.m.material.opacity = .5;
    }
  },

  update(dt) {
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
    } else if (t < 10.4) {                           // — inside: boot + base departs —
      cam.position.set(0, 1.3 + Math.sin(t * 1.4) * .006, .02);    // idle breath sway
      if (t - dt < 4.7) Audio2.tone(120, .3, 'sine', .1, 60);      // suit hum on
      if (t - dt < 5.0 && t >= 5.0) Audio2.say('Suit sealed. All systems nominal.', { rate: .95 });
      // look front → turn back to watch the pad → back to the door
      let ly = 1.5, lz = 8;
      if (t >= 5.4 && t < 6.1) lz = _lz(8, -12, _ez((t - 5.4) / .7));
      else if (t >= 6.1 && t < 9.9) { lz = -12; ly = 1.5 + this.base.position.y * .32; }
      else if (t >= 9.9) {
        const k = _ez((t - 9.9) / .5);
        lz = _lz(-12, 8, k); ly = _lz(1.5 + this.base.position.y * .32, 1.5, k);
      }
      this.look.set(0, ly, lz);
      // liftoff — thrusters flare, dust blasts out, the base climbs
      if (t - dt < 6.6 && t >= 6.6) {
        this.thrusters.visible = true;
        this.kickDust();
        Audio2.noise(1.4, .3, 180, .7);
        Audio2.tone(48, 1.1, 'sawtooth', .22, 30);
        Audio2.say('Command center lifting off.', { rate: .95 });
      }
      if (t >= 6.6 && t < 9.4) {
        this.base.position.y = .12 + _ez((t - 6.6) / 2.8) * 13;
        this.thrusters.children.forEach((c, i) =>
          c.scale.y = 1 + Math.sin(t * 30 + i * 2) * .3);
      }
      // warp-out — flash column + screen pulse, base is gone
      if (t - dt < 9.4 && t >= 9.4) {
        this.base.visible = false;
        this.warp.visible = true;
        Audio2.noise(.3, .3, 2400, .6);
        Audio2.tone(1500, .35, 'sawtooth', .14, 140);
      }
      if (t >= 9.4) {
        const k = (t - 9.4) / .8;
        this.warp.material.opacity = Math.max(0, .95 - k * 1.2);
        this.warp.scale.x = .3 + k * 7;
        fade.style.background = '#fff';
        fade.style.opacity = Math.max(0, .8 - k * 1.1);
      }
    } else if (t < 12.0) {                           // — barracks door opens —
      const k = _ez((t - 10.4) / 1.6);
      this.door.position.y = _lz(1.35, 4.05, k);
      this.doorGlow.material.opacity = _lz(.06, 1, k);
      this.outLight.intensity = _lz(0, 2.2, k);
      if (t - dt < 10.4) Audio2.noise(.8, .2, 300, .7);            // servo rumble
    } else if (t < 14.4) {                           // — walk out the door —
      const k = _ez((t - 12.0) / 2.4);
      cam.position.set(0, 1.3, _lz(.02, 7.6, k));
      this.look.set(0, 1.5, 12);
      if (t > 13.2) {                                // white-out into the lobby
        fade.style.background = '#fff';
        fade.style.opacity = Math.min(1, (t - 13.2) / 1.1);
      }
    } else this.stop();

    // dust always decays — runs regardless of phase
    for (const p of this.dust) {
      if (p.life <= 0) continue;
      p.t += dt;
      if (p.t >= p.life) { p.life = 0; p.m.visible = false; continue; }
      p.m.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - dt * 1.2);
      const k = p.t / p.life;
      p.m.scale.setScalar(.9 + k * 3.6);
      p.m.material.opacity = .5 * (1 - k);
    }

    cam.lookAt(this.look);
  },
};
