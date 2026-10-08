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
