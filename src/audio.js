import { G } from './ctx.js';
import { clamp } from './utils.js';

// Fully synthesised audio (no asset files): SFX built from filtered noise + oscillators, plus a generative music loop.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.adMuted = false;
    this.musicOn = false;
    this.intensity = 1;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = (this.ctx = new C());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.mus = ctx.createGain();
    this.mus.connect(this.master);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    if (this.musicOn) this._startMusic();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = G.profile.settings;
    this.master.gain.value = this.adMuted ? 0 : s.volume;
    this.mus.gain.value = s.music * 0.42 * this.intensity;
  }

  muteForAd(on) {
    this.adMuted = on;
    this.applyVolumes();
  }

  // ---- primitives
  _out(vol, pan, dur, t0, attack = 0.003, dest) {
    const ctx = this.ctx, g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let last = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      last = p;
    }
    last.connect(dest || this.sfx);
    return g;
  }

  noise(dur, o = {}) {
    const ctx = this.ctx, t0 = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.Q.value = o.q ?? 0.8;
    f.frequency.setValueAtTime(o.f || 1000, t0);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t0 + dur);
    src.connect(f).connect(this._out(o.vol ?? 0.5, o.pan, dur, t0, o.attack, o.dest));
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }

  tone(dur, o = {}) {
    const ctx = this.ctx, t0 = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = o.wave || 'sine';
    osc.frequency.setValueAtTime(o.f || 440, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + dur);
    osc.connect(this._out(o.vol ?? 0.3, o.pan, dur, t0, o.attack, o.dest));
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // volume / pan for a world position relative to the camera
  _spatial(pos) {
    if (!pos) return { v: 1, p: 0 };
    const cam = G.camera, dx = pos.x - cam.position.x, dy = pos.y - cam.position.y, dz = pos.z - cam.position.z;
    const d = Math.hypot(dx, dy, dz);
    const e = cam.matrixWorld.elements;
    const p = d > 0.5 ? (dx * e[0] + dy * e[1] + dz * e[2]) / d : 0;
    return { v: 1 / (1 + (d / 16) * (d / 16)), p: p * 0.8 };
  }

  play(name, pos, mul = 1) {
    if (!this.ctx || this.adMuted) return;
    const { v, p } = this._spatial(pos);
    const V = v * mul;
    if (V < 0.012) return;
    const fn = SFX[name];
    if (fn) fn(this, V, p);
  }

  // ---- generative music
  music(on, intensity = 1) {
    this.musicOn = on;
    this.intensity = intensity;
    this.applyVolumes();
    if (on && this.ctx && !this._timer) this._startMusic();
    if (!on && this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  _startMusic() {
    if (this._timer || !this.ctx) return;
    this._step = 0;
    this._next = this.ctx.currentTime + 0.1;
    this._timer = setInterval(() => this._schedule(), 30);
  }

  _schedule() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') return;
    if (this._next < ctx.currentTime - 0.3) this._next = ctx.currentTime + 0.05;
    const spb = 60 / 112 / 4;
    while (this._next < ctx.currentTime + 0.14) {
      this._musicStep(this._step, this._next - ctx.currentTime, spb);
      this._step = (this._step + 1) % 128;
      this._next += spb;
    }
  }

  _musicStep(step, delay, spb) {
    const bar = (step / 16) | 0, s = step % 16, dest = this.mus;
    const roots = [45, 41, 48, 43, 45, 41, 50, 52]; // A F C G A F D E
    const minor = [1, 0, 0, 0, 1, 0, 1, 0];
    const root = roots[bar], third = minor[bar] ? 3 : 4;
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const full = this.intensity > 0.8;
    if (s % 4 === 0) {
      this.tone(0.16, { f: 130, f2: 42, vol: 0.55, dest, delay });
      if (s === 4 || s === 12) this.noise(0.12, { f: 1900, q: 0.6, vol: 0.2, dest, delay });
    }
    if (s % 2 === 1) this.noise(0.035, { type: 'highpass', f: 7500, vol: s % 4 === 3 ? 0.09 : 0.05, dest, delay });
    if ([0, 3, 6, 10, 12, 14].includes(s)) this.tone(spb * 1.7, { f: hz(root - 12), wave: 'sawtooth', vol: 0.13, dest, delay, attack: 0.01 });
    if (s === 0) {
      for (const iv of [0, third, 7]) this.tone(spb * 15, { f: hz(root + 12 + iv), wave: 'triangle', vol: 0.045, dest, delay, attack: 0.25 });
    }
    if (full && s % 2 === 0) {
      const arp = [0, 7, 12, third + 12, 7, 12, 19, 12][(s / 2) | 0];
      this.tone(spb * 1.4, { f: hz(root + 24 + arp), wave: 'square', vol: bar >= 4 ? 0.035 : 0.022, dest, delay, attack: 0.004 });
    }
  }
}

const SFX = {
  sidearm: (a, v, p) => { a.noise(0.09, { f: 1900, vol: 0.45 * v, pan: p }); a.tone(0.07, { f: 240, f2: 90, wave: 'square', vol: 0.2 * v, pan: p }); },
  carbine: (a, v, p) => { a.noise(0.11, { f: 1500, f2: 600, vol: 0.5 * v, pan: p }); a.tone(0.08, { f: 180, f2: 60, wave: 'sawtooth', vol: 0.26 * v, pan: p }); a.tone(0.05, { f: 1500, f2: 500, wave: 'square', vol: 0.05 * v, pan: p }); },
  smg: (a, v, p) => { a.noise(0.07, { f: 2500, vol: 0.38 * v, pan: p }); a.tone(0.05, { f: 280, f2: 110, wave: 'square', vol: 0.17 * v, pan: p }); },
  shotgun: (a, v, p) => { a.noise(0.3, { type: 'lowpass', f: 1500, f2: 300, vol: 0.85 * v, pan: p }); a.tone(0.2, { f: 110, f2: 40, vol: 0.6 * v, pan: p }); a.noise(0.08, { f: 900, vol: 0.2 * v, pan: p, delay: 0.42 }); a.noise(0.08, { f: 1300, vol: 0.2 * v, pan: p, delay: 0.56 }); },
  sniper: (a, v, p) => { a.noise(0.5, { f: 900, f2: 220, vol: 0.85 * v, pan: p }); a.tone(0.32, { f: 150, f2: 35, vol: 0.7 * v, pan: p }); a.noise(0.05, { type: 'highpass', f: 5000, vol: 0.35 * v, pan: p }); },
  launcher: (a, v, p) => { a.noise(0.45, { f: 300, f2: 1400, vol: 0.5 * v, pan: p }); a.tone(0.3, { f: 90, f2: 220, wave: 'sawtooth', vol: 0.18 * v, pan: p }); },
  explosion: (a, v, p) => { a.noise(1.0, { type: 'lowpass', f: 1100, f2: 70, vol: 1.0 * v, pan: p }); a.tone(0.7, { f: 85, f2: 24, vol: 0.9 * v, pan: p }); },
  empty: (a, v) => a.noise(0.03, { f: 3200, q: 3, vol: 0.2 * v }),
  reload: (a, v) => { a.noise(0.05, { f: 1400, q: 2, vol: 0.25 * v }); a.noise(0.06, { f: 2200, q: 2, vol: 0.28 * v, delay: 0.32 }); },
  reloadEnd: (a, v) => { a.noise(0.05, { f: 2600, q: 2.5, vol: 0.3 * v }); a.tone(0.05, { f: 520, f2: 300, wave: 'square', vol: 0.06 * v }); },
  swap: (a, v) => a.noise(0.08, { f: 900, f2: 2200, vol: 0.16 * v }),
  hit: (a, v) => a.tone(0.05, { f: 1250, f2: 900, wave: 'triangle', vol: 0.3 * v }),
  headshot: (a, v) => { a.tone(0.12, { f: 1900, wave: 'triangle', vol: 0.32 * v }); a.tone(0.16, { f: 2850, vol: 0.2 * v, delay: 0.03 }); },
  shieldHit: (a, v) => a.tone(0.07, { f: 2100, f2: 1500, wave: 'sine', vol: 0.26 * v }),
  kill: (a, v) => { a.tone(0.1, { f: 660, wave: 'triangle', vol: 0.3 * v }); a.tone(0.12, { f: 990, wave: 'triangle', vol: 0.3 * v, delay: 0.08 }); a.tone(0.22, { f: 1320, wave: 'triangle', vol: 0.3 * v, delay: 0.16 }); },
  hurt: (a, v) => { a.tone(0.14, { f: 150, f2: 70, wave: 'sawtooth', vol: 0.35 * v }); a.noise(0.08, { type: 'lowpass', f: 700, vol: 0.3 * v }); },
  shieldBreak: (a, v) => { a.noise(0.25, { type: 'highpass', f: 3500, vol: 0.3 * v }); a.tone(0.3, { f: 1600, f2: 300, vol: 0.2 * v }); },
  pickup: (a, v) => { a.tone(0.07, { f: 700, wave: 'triangle', vol: 0.22 * v }); a.tone(0.1, { f: 1050, wave: 'triangle', vol: 0.22 * v, delay: 0.06 }); },
  heal: (a, v) => { a.tone(0.25, { f: 440, f2: 880, vol: 0.2 * v }); a.tone(0.25, { f: 660, f2: 1320, vol: 0.12 * v, delay: 0.08 }); },
  jump: (a, v) => a.noise(0.1, { f: 500, f2: 1200, vol: 0.1 * v }),
  land: (a, v) => { a.noise(0.09, { type: 'lowpass', f: 420, vol: 0.3 * v }); a.tone(0.08, { f: 95, f2: 50, vol: 0.25 * v }); },
  step: (a, v, p) => a.noise(0.05, { type: 'lowpass', f: 380 + Math.random() * 160, vol: 0.13 * v, pan: p }),
  dash: (a, v) => { a.noise(0.25, { f: 600, f2: 3200, vol: 0.3 * v }); a.tone(0.2, { f: 300, f2: 900, vol: 0.08 * v }); },
  pad: (a, v) => { a.tone(0.35, { f: 220, f2: 1100, wave: 'triangle', vol: 0.3 * v }); a.noise(0.3, { f: 800, f2: 3000, vol: 0.15 * v }); },
  throw: (a, v) => a.noise(0.18, { f: 700, f2: 1800, vol: 0.2 * v }),
  bounce: (a, v, p) => a.tone(0.04, { f: 900, f2: 500, wave: 'square', vol: 0.12 * v, pan: p }),
  ui: (a, v) => a.tone(0.05, { f: 880, f2: 1200, wave: 'triangle', vol: 0.16 * v }),
  hover: (a, v) => a.tone(0.03, { f: 1500, wave: 'sine', vol: 0.05 * v }),
  buy: (a, v) => { for (let i = 0; i < 4; i++) a.tone(0.09, { f: 780 * Math.pow(1.26, i), wave: 'triangle', vol: 0.2 * v, delay: i * 0.06 }); },
  deny: (a, v) => a.tone(0.14, { f: 180, f2: 120, wave: 'square', vol: 0.14 * v }),
  beep: (a, v) => a.tone(0.09, { f: 980, wave: 'square', vol: 0.12 * v }),
  storm: (a, v) => { a.tone(0.5, { f: 320, f2: 160, wave: 'sawtooth', vol: 0.16 * v }); a.tone(0.5, { f: 480, f2: 240, wave: 'sawtooth', vol: 0.1 * v, delay: 0.25 }); },
  stormTick: (a, v) => a.noise(0.12, { f: 2600, f2: 600, vol: 0.2 * v }),
  announce: (a, v) => { a.tone(0.12, { f: 520, wave: 'sawtooth', vol: 0.14 * v }); a.tone(0.2, { f: 780, wave: 'sawtooth', vol: 0.14 * v, delay: 0.09 }); },
  victory: (a, v) => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => a.tone(0.4, { f, wave: 'triangle', vol: 0.26 * v, delay: i * 0.11 })); a.tone(1.2, { f: 1047, vol: 0.2 * v, delay: 0.7 }); },
  defeat: (a, v) => { [440, 370, 311, 233].forEach((f, i) => a.tone(0.45, { f, wave: 'sawtooth', vol: 0.14 * v, delay: i * 0.18 })); },
};
