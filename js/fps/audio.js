/* ============================================================
   audio.js — WebAudio synthesized SFX (no assets needed)
   ============================================================ */

const Audio2 = {
  ctx: null, noiseBuf: null, distScale: 60,

  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // shared noise buffer
      const len = this.ctx.sampleRate * 1;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    // the first speak() cold-starts the TTS engine and can freeze the main
    // thread for a second+ — burn that cost here, inside a user gesture
    if (!this._ttsWarm && window.speechSynthesis) {
      this._ttsWarm = true;
      try {
        speechSynthesis.getVoices();
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0; u.rate = 1.4;
        speechSynthesis.speak(u);
      } catch (e) {}
    }
    return this.ctx;
  },

  /* volume from world distance */
  vol(dist) { return Math.max(0.04, Math.min(1, this.distScale / Math.max(1, dist * dist * 0.4))); },

  tone(freq, dur, type, gain, slideTo) {
    try {
      const ctx = this.ensure();
      const o = ctx.createOscillator(), g = ctx.createGain();
      const t = ctx.currentTime;
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + dur);
    } catch (e) {}
  },

  noise(dur, gain, freq, q) {
    try {
      const ctx = this.ensure();
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 0.8;
      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(ctx.destination);
      src.start(t); src.stop(t + dur);
    } catch (e) {}
  },

  // your own rifle is right next to your ear — louder + a low muzzle thump
  shot()    { this.noise(0.09, 0.52, 1800, 0.5); this.tone(220, 0.06, 'square', 0.16, 90);
              this.tone(75, 0.08, 'sine', 0.18, 40); },
  shotBig() { this.noise(0.2, 0.65, 320, 1.4); this.tone(85, 0.3, 'sawtooth', 0.34, 38);
              this.tone(160, 0.12, 'square', 0.15, 60);
              this.tone(55, 0.12, 'sine', 0.2, 30); },
  boom(d)   { const v = this.vol(d); this.noise(0.3, 0.5 * v, 200, 1.8);
              this.tone(65, 0.4, 'sawtooth', 0.3 * v, 30); },
  dry()     { this.tone(1200, 0.04, 'square', 0.06, 800); },
  reload()  { this.noise(0.12, 0.12, 900, 1.5); setTimeout(() => this.tone(500, 0.05, 'square', 0.08), 350);
              setTimeout(() => this.noise(0.08, 0.14, 1400, 2), 900); },
  hit()     { this.tone(700, 0.05, 'triangle', 0.10, 400); },
  kill(d)   { const v = this.vol(d); this.tone(300, 0.28, 'sawtooth', 0.14 * v, 60);
              this.noise(0.2, 0.12 * v, 500, 1); },
  screech(d){ const v = this.vol(d);
              this.tone(900 + Math.random() * 500, 0.25, 'sawtooth', 0.09 * v, 1800);
              this.tone(1400, 0.18, 'square', 0.05 * v, 700); },
  hurt()    { this.tone(140, 0.2, 'sawtooth', 0.16, 70); this.noise(0.15, 0.12, 300, 1); },
  wave()    { this.tone(80, 0.7, 'sawtooth', 0.14, 45); this.tone(160, 0.5, 'triangle', 0.08, 90); },
  spit(d)   { const v = this.vol(d); this.tone(650, 0.16, 'sawtooth', 0.09 * v, 950);
              this.noise(0.14, 0.08 * v, 700, 1.2); },
  pickup()  { this.tone(880, 0.08, 'sine', 0.10, 1320); },
  heal()    { this.tone(980, 0.07, 'sine', 0.10, 1560); },
  step()    { this.noise(0.05, 0.05, 500, 1); },
  jump()    { this.noise(0.08, 0.07, 700, 1); },
  over()    { this.tone(160, 1.2, 'sawtooth', 0.16, 40); },
  spawn(d)  { const v = this.vol(d); this.tone(500, 0.4, 'sawtooth', 0.07 * v, 150); },
  shotAt(d) { const v = this.vol(d); this.noise(0.08, 0.22 * v, 1700, 0.5);
              this.tone(210, 0.05, 'square', 0.07 * v, 90); },
  hitAt(d)  { const v = this.vol(d); this.tone(520, 0.07, 'triangle', 0.09 * v, 260); },
  /* hydraulic ram — valve hiss sweeping down over a low pump rumble */
  hydraulic() {
    try {
      const ctx = this.ensure(), t = ctx.currentTime;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = 1.1;
      f.frequency.setValueAtTime(2600, t);
      f.frequency.exponentialRampToValueAtTime(360, t + .6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(.22, t + .06);   // valve cracks open
      g.gain.exponentialRampToValueAtTime(.0001, t + .65);
      src.connect(f); f.connect(g); g.connect(ctx.destination);
      src.start(t); src.stop(t + .68);
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(52, t);
      o.frequency.linearRampToValueAtTime(85, t + .45);   // piston loading up
      og.gain.setValueAtTime(.0001, t);
      og.gain.exponentialRampToValueAtTime(.11, t + .12);
      og.gain.exponentialRampToValueAtTime(.0001, t + .58);
      o.connect(og); og.connect(ctx.destination);
      o.start(t); o.stop(t + .6);
    } catch (e) {}
  },
  radio()   { this.tone(1150, 0.04, 'square', 0.04, 1150);
              setTimeout(() => this.tone(1500, 0.05, 'square', 0.04, 1500), 60); },

  /* suit computer voice — female TTS with a calm synth delivery */
  voice() {
    if (!window.speechSynthesis) return null;
    if (this._voice) return this._voice;             // cache only a found voice — list may load late
    const prefs = /samantha|victoria|karen|moira|zira|female|susan|allison|ava|serena|kate/i;
    const all = speechSynthesis.getVoices();
    this._voice = all.find(v => prefs.test(v.name))
             || all.find(v => v.lang.startsWith('en'))
             || null;
    return this._voice;
  },
  say(text, opts) {
    try {
      if (!window.speechSynthesis) return;
      speechSynthesis.cancel();                      // don't queue stale warnings
      const u = new SpeechSynthesisUtterance(text);
      const v = this.voice();
      if (v) u.voice = v;
      u.rate = opts && opts.rate || 1.0;
      u.pitch = opts && opts.pitch || 1.05;
      u.volume = 0.9;
      speechSynthesis.speak(u);
    } catch (e) {}
  },
  suitCritical() {
    this.tone(880, 0.12, 'square', 0.08, 440);       // klaxon chirp under the voice
    this.tone(880, 0.12, 'square', 0.08, 440);
    this.say('Suit... critical', { rate: 0.95, pitch: 1.1 });
  },
};

// browsers park the AudioContext until a gesture — grab every input to un-mute
if (typeof document !== 'undefined') {
  const _unlock = () => { try { Audio2.ensure().resume(); } catch (e) {} };
  document.addEventListener('pointerdown', _unlock);
  document.addEventListener('keydown', _unlock);
}

/* ============ cinematic score — synthesized dread, no audio files ============
   D-minor drone + war drums on a 16-step grid (100bpm 16ths). Three intensity
   levels ride up with the battle; a dissonant sting marks the ultras. */
Audio2.music = null;
Audio2._musStep = 0.15;

Audio2.musicStart = function () {
  try {
    const ctx = this.ensure();
    this.musicStop();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 3.5);   // swell in
    master.connect(ctx.destination);
    // the drone — detuned D saws through a slow-breathing lowpass + sub sine
    const droneG = ctx.createGain(); droneG.gain.value = .10;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 2;
    const lfo = ctx.createOscillator(); lfo.frequency.value = .07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 140;
    lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
    const oA = ctx.createOscillator(); oA.type = 'sawtooth'; oA.frequency.value = 36.71;        // D1
    const oB = ctx.createOscillator(); oB.type = 'sawtooth'; oB.frequency.value = 73.42 * 1.003; // D2+
    const oC = ctx.createOscillator(); oC.type = 'sine'; oC.frequency.value = 18.36;             // D0 sub
    oA.connect(lp); oB.connect(lp); oC.connect(droneG);
    lp.connect(droneG); droneG.connect(master);
    oA.start(); oB.start(); oC.start();
    this.music = {
      master, nodes: [oA, oB, oC, lfo], step: 0, lvl: 0,
      nextT: ctx.currentTime + .1,
      timer: setInterval(() => this._musPump(), 60),
    };
  } catch (e) {}
};

Audio2.musicStop = function () {
  const m = this.music; if (!m) return;
  this.music = null;
  clearInterval(m.timer);
  try {
    const at = this.ctx.currentTime;
    m.master.gain.cancelScheduledValues(at);
    m.master.gain.setValueAtTime(m.master.gain.value, at);
    m.master.gain.linearRampToValueAtTime(0, at + 1.4);
    for (const o of m.nodes) { try { o.stop(at + 1.5); } catch (e) {} }
    setTimeout(() => { try { m.master.disconnect(); } catch (e) {} }, 1800);
  } catch (e) {}
};

Audio2.musicLevel = function (n) {              // intensity only ever climbs
  if (this.music) this.music.lvl = Math.max(this.music.lvl, n);
};

/* BRAAAM — the ultras step on stage: low cluster with a minor-second rub */
Audio2.musicSting = function () {
  try {
    const ctx = this.ensure(), m = this.music; if (!m) return;
    const at = ctx.currentTime + .02;
    for (const f of [36.71, 73.42, 110, 138.4]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      const gn = ctx.createGain();
      gn.gain.setValueAtTime(.001, at);
      gn.gain.exponentialRampToValueAtTime(.14, at + .05);
      gn.gain.exponentialRampToValueAtTime(.001, at + 2.6);
      o.connect(lp); lp.connect(gn); gn.connect(m.master);
      o.start(at); o.stop(at + 2.7);
    }
    this._drum(m.master, at, 40, .7);
  } catch (e) {}
};

Audio2._musPump = function () {                 // lookahead scheduler — 250ms ahead
  const m = this.music; if (!m) return;
  const ctx = this.ctx;
  while (m.nextT < ctx.currentTime + 0.25) {
    this._musNote(m, m.step, m.nextT, m.lvl);
    m.step++; m.nextT += this._musStep;
  }
};

Audio2._musNote = function (m, s, at, lvl) {
  const st = s % 16, bar = (s / 16) | 0;
  if (st === 0 || (lvl >= 1 && st === 10)) this._drum(m.master, at, 52, .5);   // timpani downbeat
  if ((lvl >= 1 && (st === 0 || st === 8)) || (lvl >= 2 && (st === 3 || st === 11)))
    this._drum(m.master, at, 88, .32);                                         // war-drum hits
  if (lvl >= 2 && (st === 4 || st === 12)) this._snap(m.master, at);           // snare cracks
  if (st === 0 && bar % 2 === 0) this._stab(m.master, at, bar);                // slow minor stab
  if (lvl >= 2 && st === 15 && bar % 4 === 3) this._riser(m.master, at);       // dread riser
};

Audio2._drum = function (master, at, f, g) {    // timpani/tom — pitch-drop sine thump
  const ctx = this.ctx, o = ctx.createOscillator(), gn = ctx.createGain();
  o.frequency.setValueAtTime(f * 2, at);
  o.frequency.exponentialRampToValueAtTime(f * .6, at + .18);
  gn.gain.setValueAtTime(g, at);
  gn.gain.exponentialRampToValueAtTime(.001, at + .5);
  o.connect(gn); gn.connect(master);
  o.start(at); o.stop(at + .55);
};

Audio2._snap = function (master, at) {          // noise snare-crack
  const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = .8;
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(.2, at);
  gn.gain.exponentialRampToValueAtTime(.001, at + .12);
  src.connect(bp); bp.connect(gn); gn.connect(master);
  src.start(at); src.stop(at + .15);
};

Audio2._stab = function (master, at, bar) {     // i–VI–iv–V wheel, slow-swelled = dread
  const CH = [[146.83, 174.61, 220], [116.54, 146.83, 174.61],
              [98, 116.54, 146.83], [110, 138.59, 164.81]];
  const ch = CH[((bar / 2) | 0) % 4];
  for (const f of ch) {
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const gn = this.ctx.createGain();
    gn.gain.setValueAtTime(0, at);
    gn.gain.linearRampToValueAtTime(.045, at + .3);
    gn.gain.linearRampToValueAtTime(0, at + 2.4);
    o.connect(lp); lp.connect(gn); gn.connect(master);
    o.start(at); o.stop(at + 2.5);
  }
};

Audio2._riser = function (master, at) {         // 2s noise sweep up into the next bar
  const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4;
  bp.frequency.setValueAtTime(300, at);
  bp.frequency.exponentialRampToValueAtTime(2400, at + 1.8);
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0, at);
  gn.gain.linearRampToValueAtTime(.11, at + 1.6);
  gn.gain.linearRampToValueAtTime(0, at + 2.2);
  src.connect(bp); bp.connect(gn); gn.connect(master);
  src.start(at); src.stop(at + 2.3);
};
