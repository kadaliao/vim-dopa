// Everything is synthesized with Web Audio; no sound files.
// The loop grows with the stage (0-6): pad -> kick -> bass -> hats + arp ->
// clap -> lead -> full party with a faster tempo and an open filter.
const CHORDS = [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]]; // C G Am F
const ROOTS = [0, -5, -3, -7];
const PENTA = [0, 2, 4, 7, 9];
const LEAD = [
  [12, null, 7, null, 9, null, 7, 4], [11, null, 7, null, 2, null, 7, null],
  [12, null, 9, null, 16, null, 12, 9], [9, null, 5, null, 12, null, 14, null],
];
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

export class Sound {
  constructor() {
    this.ctx = null; this.stage = 0; this.muted = false; this.playing = false;
    this.step = 0; this.nextT = 0; this.timer = null; this.onBeat = null;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.music = ctx.createGain(); this.music.gain.value = 0; this.music.connect(this.master);
    this.duck = ctx.createGain(); this.duck.connect(this.music);
    // A feedback delay gives the lead and plucks some space.
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = 0.375;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const wet = ctx.createGain(); wet.gain.value = 0.22;
    this.delay.connect(fb).connect(this.delay); this.delay.connect(wet).connect(this.master);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.03);
  }

  setStage(s) { this.stage = s; }
  get bpm() { return 112 + this.stage * 3; }

  start() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    const t = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setTargetAtTime(0.9, t, 0.4);
    this.step = 0; this.nextT = t + 0.08;
    this.timer = setInterval(() => this.tick(), 25);
  }

  stop() {
    if (!this.ctx || !this.playing) return;
    this.playing = false;
    this.music.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    clearInterval(this.timer);
  }

  tick() {
    const ctx = this.ctx;
    while (this.nextT < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextT);
      this.nextT += 60 / this.bpm / 4;
      this.step++;
    }
  }

  playStep(step, t) {
    const s = this.stage, i = step % 16, bar = Math.floor(step / 16) % 4;
    const chord = CHORDS[bar], root = ROOTS[bar];
    if (i % 4 === 0 && this.onBeat) {
      const delay = Math.max(0, (t - this.ctx.currentTime) * 1000);
      setTimeout(() => this.onBeat?.(i / 4, s), delay);
    }
    if (i === 0) this.pad(chord, t, (60 / this.bpm) * 4);
    if (s >= 1 && i % 4 === 0) this.kick(t);
    if (s >= 6 && i === 14) this.kick(t, 0.6);
    if (s >= 2 && i % 4 === 2) this.bass(36 + root + 12, t);
    if (s >= 5 && i % 4 === 3) this.bass(36 + root + 24, t, 0.5);
    if (s >= 3 && (s >= 5 ? true : i % 2 === 1)) this.hat(t, i % 4 === 2 ? 0.09 : 0.05);
    if (s >= 3) {
      const every = s >= 4 ? 1 : 2;
      if (i % every === 0) {
        const n = chord[(i / every) % 3] + 72 + (Math.floor(i / 6) % 2) * 12;
        this.pluck(mtof(n), t, 0.05, s >= 6 ? 'sawtooth' : 'triangle');
      }
    }
    if (s >= 4 && (i === 4 || i === 12)) this.clap(t);
    if (s >= 5 && i % 2 === 0) {
      const n = LEAD[bar][i / 2];
      if (n != null) this.lead(mtof(72 + n), t, (60 / this.bpm) * 0.45);
    }
    if (s >= 6 && i === 0 && bar === 0) this.crash(t);
  }

  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  osc(type, f, t, dur, out) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    o.connect(out); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  pad(chord, t, dur) {
    const ctx = this.ctx, g = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(500 + this.stage * 450, t);
    g.connect(lp).connect(this.music);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.25);
    g.gain.setValueAtTime(0.05, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const n of chord) for (const det of [-7, 7]) {
      const o = this.osc('sawtooth', mtof(60 + n), t, dur, g); o.detune.value = det;
    }
  }

  kick(t, v = 1) {
    const ctx = this.ctx, g = ctx.createGain(); g.connect(this.music);
    const o = this.osc('sine', 150, t, 0.3, g);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(g, t, 0.003, 0.9 * v, 0.28);
  }

  noiseHit(t, type, f, q, peak, dec) {
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = type; bp.frequency.value = f; bp.Q.value = q;
    const g = ctx.createGain();
    src.connect(bp).connect(g).connect(this.music);
    this.env(g, t, 0.002, peak, dec);
    src.start(t, Math.random() * 0.5); src.stop(t + dec + 0.05);
  }

  hat(t, v) { this.noiseHit(t, 'highpass', 7500, 0.7, v, 0.04); }
  clap(t) { for (const d of [0, 0.012, 0.024]) this.noiseHit(t + d, 'bandpass', 1600, 1.2, 0.25, 0.12); }
  crash(t) { this.noiseHit(t, 'highpass', 5000, 0.3, 0.12, 1.2); }

  bass(m, t, v = 1) {
    const ctx = this.ctx, g = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400 + this.stage * 120; lp.Q.value = 6;
    g.connect(lp).connect(this.music);
    this.osc('sawtooth', mtof(m), t, 0.2, g);
    this.env(g, t, 0.005, 0.22 * v, 0.18);
  }

  pluck(f, t, v, type = 'triangle', out = this.music) {
    const g = this.ctx.createGain(); g.connect(out); g.connect(this.delay);
    this.osc(type, f, t, 0.25, g);
    this.env(g, t, 0.003, v, 0.22);
  }

  lead(f, t, dur) {
    const ctx = this.ctx, g = ctx.createGain(); g.connect(this.music); g.connect(this.delay);
    const o = this.osc('square', f, t, dur, g);
    const lfo = ctx.createOscillator(); const lg = ctx.createGain(); lg.gain.value = 6;
    lfo.frequency.value = 5.5; lfo.connect(lg).connect(o.detune); lfo.start(t); lfo.stop(t + dur + 0.05);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
    g.gain.setValueAtTime(0.06, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  // A soft note for every key press; it climbs the scale as you type.
  key(n) {
    if (!this.ctx) return;
    const deg = PENTA[n % 5] + 12 * (Math.floor(n / 5) % 3);
    const bar = Math.floor(this.step / 16) % 4;
    this.pluck(mtof(72 + ROOTS[bar] + deg), this.ctx.currentTime, 0.07, 'triangle', this.master);
  }

  // kind: 'ok' | 'par' | 'beat'
  solve(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const bar = Math.floor(this.step / 16) % 4;
    const ch = CHORDS[bar];
    const notes = [...ch, ...ch.map((n) => n + 12), ch[0] + 24];
    if (kind !== 'ok') notes.push(ch[1] + 24, ch[2] + 24);
    notes.forEach((n, i) => this.pluck(mtof(72 + n), t + i * 0.045, 0.12, kind === 'beat' ? 'square' : 'triangle', this.master));
    if (kind === 'beat') for (let i = 0; i < 6; i++) this.pluck(mtof(96 + PENTA[i % 5]), t + 0.3 + i * 0.03, 0.05, 'sine', this.master);
  }

  milestone() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.pluck(mtof(67 + n), t + i * 0.06, 0.1, 'square', this.master));
  }

  ui() { if (this.ctx) this.pluck(mtof(84), this.ctx.currentTime, 0.05, 'sine', this.master); }
}
