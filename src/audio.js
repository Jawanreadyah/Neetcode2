// Fully synthesized audio: rain bed, wind, thunder, sword swings, steel clashes, impacts.
export class Audio {
  constructor() { this.ctx = null; }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = C.createGain(); this.master.gain.value = 0.7; this.master.connect(C.destination);
    // noise buffers
    const len = C.sampleRate * 4; const buf = C.createBuffer(2, len, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12; } }
    this.noise = buf;
    const loop = (freq, q, gain, type = 'bandpass') => {
      const s = C.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = C.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = C.createGain(); g.gain.value = gain; s.connect(f).connect(g).connect(this.master); s.start(); return { s, f, g };
    };
    this.rain = loop(2600, 0.4, 0.55);
    this.rainLow = loop(500, 0.6, 0.35);
    this.wind = loop(320, 2.5, 0.18);
    const lfo = C.createOscillator(); lfo.frequency.value = 0.07; const lg = C.createGain(); lg.gain.value = 160; lfo.connect(lg).connect(this.wind.f.frequency); lfo.start();
    // crackle for fires
    this.crackleT = 0;
  }
  burst({ freq = 1000, q = 1, dur = 0.2, gain = 0.5, type = 'bandpass', sweep = 0, delay = 0 }) {
    if (!this.ctx) return; const C = this.ctx, t = C.currentTime + delay;
    const s = C.createBufferSource(); s.buffer = this.noise; const f = C.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random() * 3); s.stop(t + dur + 0.05);
  }
  tone(freq, dur, gain, type = 'triangle', delay = 0) {
    if (!this.ctx) return; const C = this.ctx, t = C.currentTime + delay;
    const o = C.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.97, t + dur);
    const g = C.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur);
  }
  swing(heavy) { this.burst({ freq: heavy ? 500 : 900, q: 1.2, dur: heavy ? 0.4 : 0.25, gain: heavy ? 0.5 : 0.35, sweep: 2.5 }); }
  clash() {
    this.burst({ freq: 4500, q: 2, dur: 0.12, gain: 0.6, type: 'highpass' });
    for (const f of [1830, 2470, 3120, 4410]) this.tone(f * (0.97 + Math.random() * 0.06), 0.6 + Math.random() * 0.4, 0.05, 'sine');
    this.tone(620, 0.25, 0.08, 'square');
  }
  hit(heavy) { this.burst({ freq: 180, q: 0.8, dur: 0.25, gain: heavy ? 0.9 : 0.6, type: 'lowpass' }); this.burst({ freq: 1400, q: 1.5, dur: 0.12, gain: 0.3 }); this.tone(1200, 0.2, 0.03, 'sine'); }
  grunt() { this.tone(110 + Math.random() * 40, 0.25, 0.12, 'sawtooth'); }
  thunder(delay) { this.burst({ freq: 120, q: 0.5, dur: 4.5, gain: 1.0, type: 'lowpass', sweep: 0.4, delay }); this.burst({ freq: 400, q: 0.5, dur: 1.2, gain: 0.5, type: 'lowpass', sweep: 0.3, delay }); }
  horn() { if (!this.ctx) return; for (const [f, d] of [[110, 0], [165, 0.02]]) this.tone(f, 2.4, 0.07, 'sawtooth', d); }
  step() { this.burst({ freq: 300 + Math.random() * 200, q: 1, dur: 0.12, gain: 0.12, type: 'lowpass' }); }
}
