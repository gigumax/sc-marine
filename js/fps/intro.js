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
    s.fog = new THREE.Fog(0x06090f, 6, 22);

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
    B(12, 4, .2, wall, 0, 2, -6);                       // back wall
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

    /* --- the CMC suit on its rack — front (+z) faces the room --- */
    const suit = new THREE.Group(); s.add(suit);
    B(.5, .08, .5, joint, 0, .04, -.2, suit);                       // rack base
    B(.1, 1.9, .1, joint, 0, .95, -.48, suit);                      // rack post
    B(.14, .3, .14, joint, 0, 1.75, -.42, suit);                    // head mount
    B(.2, .13, .32, armor, -.16, .07, 0, suit);                     // boots
    B(.2, .13, .32, armor, .16, .07, 0, suit);
    B(.17, .6, .24, armor, -.16, .43, 0, suit);                     // legs
    B(.17, .6, .24, armor, .16, .43, 0, suit);
    B(.22, .1, .28, armor, -.16, .72, .02, suit);                   // knee plates
    B(.22, .1, .28, armor, .16, .72, .02, suit);
    B(.6, .72, .16, armor, 0, 1.14, -.18, suit);                    // back plate
    B(.12, .6, .34, armor, -.3, 1.14, 0, suit);                     // rib sides
    B(.12, .6, .34, armor, .3, 1.14, 0, suit);
    B(.46, .58, .34, dark, 0, 1.14, 0, suit);                       // dark cavity
    B(.34, .2, .36, armor, -.4, 1.56, 0, suit);                     // shoulders
    B(.34, .2, .36, armor, .4, 1.56, 0, suit);
    B(.12, .5, .16, armor, -.4, 1.22, 0, suit);                     // hanging arms
    B(.12, .5, .16, armor, .4, 1.22, 0, suit);
    B(.28, .26, .3, armor, 0, 1.88, 0, suit);                       // helmet
    B(.22, .06, .03, glowC, 0, 1.9, .16, suit);                     // visor slit
    // chest plate — hinged at its top edge, swings up to open
    this.chest = new THREE.Group();
    this.chest.position.set(0, 1.5, .3);
    const plate = B(.52, .62, .07, armor, 0, -.31, 0, this.chest);
    B(.3, .1, .02, glowC, 0, -.2, .05, this.chest);                 // chest light
    plate.material = armor;
    suit.add(this.chest);
    this.chest.rotation.x = -1.75;                                  // start open
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
    this.chest.rotation.x = -1.75;
    this.door.position.y = 1.35;
    this.doorGlow.material.opacity = .06;
    this.outLight.intensity = 0;
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
      this.chest.rotation.x = _lz(-1.75, 0, k);
      if (t - dt < 4.0) Audio2.tone(70, .25, 'square', .25, 40);   // heavy clunk
      if (t - dt < 4.4 && t >= 4.4) Audio2.noise(.2, .15, 900, 1); // pneumatic seal
      const v = document.getElementById('intro-visor');
      v.style.opacity = Math.min(1, (t - 4.0) / .5);
    } else if (t < 9.7) {                            // — inside: suit boots (5s) —
      cam.position.set(0, 1.3 + Math.sin(t * 1.4) * .006, .02);    // idle breath sway
      this.look.set(0, 1.5, 8);
      if (t - dt < 4.7) Audio2.tone(120, .3, 'sine', .1, 60);      // suit hum on
      if (t - dt < 8.9 && t >= 8.9) Audio2.say('Suit sealed. All systems nominal.', { rate: .95 });
    } else if (t < 11.3) {                           // — barracks door opens —
      const k = _ez((t - 9.7) / 1.6);
      this.door.position.y = _lz(1.35, 4.05, k);
      this.doorGlow.material.opacity = _lz(.06, 1, k);
      this.outLight.intensity = _lz(0, 2.2, k);
      if (t - dt < 9.7) Audio2.noise(.8, .2, 300, .7);             // servo rumble
    } else if (t < 13.7) {                           // — walk out the door —
      const k = _ez((t - 11.3) / 2.4);
      cam.position.set(0, 1.3, _lz(.02, 7.6, k));
      this.look.set(0, 1.5, 12);
      if (t > 12.5) {                                // white-out into the lobby
        fade.style.background = '#fff';
        fade.style.opacity = Math.min(1, (t - 12.5) / 1.1);
      }
    } else this.stop();

    cam.lookAt(this.look);
  },
};
