/* ============================================================
   intro.js — suit-up cinematic: barracks room, CMC armor on a
   rack, chest opens, you step in, it seals, suit boots (~5s),
   the barracks door opens, you walk out to the fight.
   Renders its own scene/camera while Intro.playing is true.
   ============================================================ */

const _ez = x => x * x * (3 - 2 * x);           // smoothstep
const _lz = (a, b, x) => a + (b - a) * x;

const Intro = {
  playing: false, menu: false, t: 0, menuT: 0, cb: null,
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

    /* chest = four panels hinged at the torso's outer corners —
       they peel outward so the cross seam splits open first */
    this.panels = [];
    for (const [cx, cy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(cx * .27, 1.18 + cy * .33, .24);           // at the suit's corner
      pivot.userData.axis = new THREE.Vector3(-cy, cx, 0).normalize(); // tangent → swings out
      const plate = B(.26, .33, .06, armor, -cx * .135, -cy * .16, .03, pivot);
      plate.material = plate.material.clone();
      plate.material.color.setHex(0x36495e);
      B(.05, .05, .065, glowC, -cx * .06, -cy * .08, .04, pivot);   // corner light
      body.add(pivot);
      this.panels.push(pivot);
    }
    this.setChest(0);                                               // sealed — no opening yet
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

  active() { return this.playing || this.menu; },

  play(cb) {
    if (this.playing) return;
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
    this.playing = false; this.menu = false;
    document.removeEventListener('keydown', this._skip);
    document.removeEventListener('mousedown', this._skip);
    document.getElementById('storyscreen').classList.add('hidden');
    document.getElementById('intro-visor').style.opacity = 0;
    const f = document.getElementById('intro-fade');
    f.style.opacity = 0; f.style.background = '#fff';
    const cb = this.cb; this.cb = null;
    if (cb) cb();
  },

  update(dt) {
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
