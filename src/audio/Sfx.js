// Tiny procedural sound effects via WebAudio (no audio files). Rate-limited per sound so
// a thousand-unit brawl doesn't turn into white noise.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.last = new Map();
    this.noiseBuf = null;
    try { this.muted = localStorage.getItem('battlesim.muted') === '1'; } catch { /* ignore */ }
  }

  // Must be called from a user gesture before sounds can play.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.35;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('battlesim.muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.value = m ? 0 : 0.35;
  }

  ok(name, gap) {
    if (!this.ctx || this.muted) return false;
    const t = this.ctx.currentTime;
    if ((this.last.get(name) ?? -1) > t - gap) return false;
    this.last.set(name, t);
    return true;
  }

  tone(type, f0, f1, dur, vol, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, vol, freq, q = 1, type = 'lowpass') {
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf;
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.3);
    s.stop(t + dur + 0.02);
  }

  place() { if (this.ok('place', 0.03)) this.tone('sine', 520, 780, 0.08, 0.25); }
  erase() { if (this.ok('erase', 0.03)) this.tone('sine', 400, 200, 0.08, 0.2); }
  click() { if (this.ok('click', 0.03)) this.tone('triangle', 900, 700, 0.04, 0.15); }

  event(e) {
    if (!this.ctx || this.muted) return;
    switch (e.type) {
      case 'hit': if (this.ok('hit', 0.045)) { this.noise(0.08, e.big ? 0.5 : 0.28, e.big ? 500 : 900); this.tone('sine', e.big ? 140 : 220, 60, 0.1, 0.3); } break;
      case 'block': if (this.ok('block', 0.06)) this.tone('square', 1400, 1100, 0.05, 0.08); break;
      case 'death': if (this.ok('death', 0.09)) this.tone('triangle', 500 + Math.random() * 200, 120, 0.25, 0.14); break;
      case 'explosion': if (this.ok('boom', 0.08)) { this.noise(0.7, 0.9, 380); this.tone('sine', 90, 30, 0.5, 0.6); } break;
      case 'shockwave': if (this.ok('shock', 0.1)) { this.noise(0.4, 0.7, 250); this.tone('sine', 70, 30, 0.35, 0.5); } break;
      case 'tracer':
        if (e.kind === 'laser') { if (this.ok('laser', 0.05)) this.tone('square', 1800, 300, 0.1, 0.06); }
        else if (e.kind === 'sniper') { if (this.ok('sniper', 0.1)) { this.noise(0.25, 0.5, 2500, 0.7, 'bandpass'); this.tone('sine', 300, 60, 0.2, 0.3); } }
        else if (this.ok(e.kind === 'minigun' ? 'mini' : 'gun', e.kind === 'minigun' ? 0.035 : 0.05)) this.noise(0.06, 0.28, 2200, 0.8, 'bandpass');
        break;
      case 'launch':
        if (e.kind === 'rocket') { if (this.ok('rocket', 0.1)) this.noise(0.5, 0.35, 900); }
        else if (e.kind === 'boulder') { if (this.ok('catapult', 0.2)) this.tone('sawtooth', 120, 60, 0.25, 0.2); }
        else if (this.ok('whoosh', 0.06)) this.noise(0.18, 0.12, 1500, 2, 'bandpass');
        break;
      case 'heal': if (this.ok('heal', 0.15)) { this.tone('sine', 660, 990, 0.18, 0.1); this.tone('sine', 990, 1320, 0.18, 0.08, 0.08); } break;
      case 'aura': if (this.ok('aura', 0.2)) this.tone('sine', 300, 900, 0.4, 0.15); break;
      case 'blink': if (this.ok('blink', 0.05)) this.noise(0.1, 0.2, 3000, 1, 'highpass'); break;
      case 'leap': if (this.ok('leap', 0.2)) this.tone('sawtooth', 200, 500, 0.25, 0.12); break;
      case 'end': this.fanfare(); break;
      default:
    }
  }

  beamHum(active) {
    if (!this.ctx) return;
    if (active && !this.muted) {
      if (!this.hum) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = 95; g.gain.value = 0.05;
        o.connect(g).connect(this.master); o.start();
        this.hum = { o, g };
      }
    } else if (this.hum) {
      this.hum.o.stop(); this.hum = null;
    }
  }

  fanfare() {
    if (!this.ctx || this.muted) return;
    [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.2, i * 0.12));
  }
}
