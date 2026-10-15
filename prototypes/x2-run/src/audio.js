// Звуки синтезируются в браузере (WebAudio): внешних файлов нет. Включаются после первого нажатия игрока.
export class Sfx {
  constructor() {
    this.ctx = null; this.master = null;
    try { this.muted = localStorage.getItem('x2r:mute') === '1'; } catch { this.muted = false; }
    this.last = {};
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.5; this.master.connect(this.ctx.destination); } catch { this.ctx = null; }
  }
  setMuted(m) { this.muted = m; try { localStorage.setItem('x2r:mute', m ? '1' : '0'); } catch { /* ignore */ } if (this.master) this.master.gain.value = m ? 0 : 0.5; }
  ok(name, gap = 0.03) { if (!this.ctx || this.muted) return false; const t = this.ctx.currentTime; if (t - (this.last[name] || 0) < gap) return false; this.last[name] = t; return true; }
  tone(type, f0, f1, dur, vol = 0.2, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol = 0.3, lp = 1800, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'lowpass'; f.frequency.value = lp; g.gain.value = vol; s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  }
  play(e) {
    if (!this.ctx || this.muted) return;
    switch (e.type) {
      case 'shoot': if (this.ok('shoot', 0.045)) { this.tone('square', e.weapon === 'heavy' ? 220 : 880, e.weapon === 'heavy' ? 70 : 240, e.weapon === 'heavy' ? 0.2 : 0.09, 0.07); } break;
      case 'enemyHit': case 'bossHit': if (this.ok('hit', 0.04)) this.tone('triangle', 300, 120, 0.07, 0.1); break;
      case 'ping': if (this.ok('ping', 0.05)) this.tone('square', 1500, 900, 0.05, 0.05); break;
      case 'kill': this.noise(0.18, 0.28, 2200); this.tone('sawtooth', 240, 60, 0.18, 0.12); break;
      case 'explosion': this.noise(e.big ? 0.9 : 0.35, e.big ? 0.55 : 0.3, e.big ? 900 : 1600); this.tone('sine', e.big ? 110 : 160, 30, e.big ? 0.8 : 0.3, 0.3); break;
      case 'hit': case 'fall': this.noise(0.25, 0.4, 700); this.tone('sawtooth', 200, 50, 0.35, 0.22); break;
      case 'jump': if (this.ok('jump', 0.1)) this.tone('sine', 300, 700, 0.14, 0.09); break;
      case 'land': if (this.ok('land', 0.1)) this.noise(0.05, 0.1, 500); break;
      case 'pickup': [523, 659, 784, 1046].forEach((f, i) => this.tone('square', f, f * 1.01, 0.12, 0.09, i * 0.06)); break;
      case 'lay': if (this.ok('lay', 0.12)) { this.tone('triangle', 520, 360, 0.07, 0.06); } break;
      case 'enemyShot': if (this.ok('eshot', 0.08)) this.tone('sawtooth', 420, 160, 0.1, 0.06); break;
      case 'charge': this.tone('sawtooth', 70, 140, 0.5, 0.12); break;
      case 'bossStart': [110, 98, 82].forEach((f, i) => this.tone('sawtooth', f, f * 0.9, 0.5, 0.2, i * 0.28)); break;
      case 'bossDefeated': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone('square', f, f, 0.2, 0.1, i * 0.1)); break;
      case 'zone': [440, 554, 659].forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.1, i * 0.08)); break;
      case 'win': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone('square', f, f, 0.3, 0.1, i * 0.14)); break;
      case 'over': [330, 262, 196, 131].forEach((f, i) => this.tone('sawtooth', f, f * 0.95, 0.35, 0.12, i * 0.2)); break;
      case 'respawn': this.tone('sine', 300, 900, 0.25, 0.1); break;
    }
  }
}

/** Простая генеративная музыка: бас, ударные и арпеджио. Тональность зависит от зоны, у босса темп выше. */
export class Music {
  constructor(sfx) {
    this.sfx = sfx; this.timer = 0; this.step = 0; this.nextT = 0; this.mode = 'run'; this.zone = 0; this.on = false;
    this.roots = [110, 146.83, 98, 123.47];
    this.scale = [0, 3, 5, 7, 10, 12, 15];
  }
  get c() { return this.sfx.ctx; }
  start(mode = this.mode) {
    this.mode = mode;
    if (!this.c || this.on) return;
    this.on = true; this.step = 0; this.nextT = this.c.currentTime + 0.08;
    if (!this.out) { this.out = this.c.createGain(); this.out.gain.value = 0.55; this.out.connect(this.sfx.master); }
    this.timer = setInterval(() => this.tick(), 40);
  }
  stop() { this.on = false; clearInterval(this.timer); this.timer = 0; }
  setMode(m) { this.mode = m; }
  setZone(z) { this.zone = z; }
  note(type, f, t, dur, vol) {
    const c = this.c, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.02);
  }
  drum(kind, t) {
    const c = this.c;
    if (kind === 'kick') { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16); o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.18); return; }
    const n = Math.floor(c.sampleRate * (kind === 'snare' ? 0.12 : 0.04)), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = buf; f.type = 'highpass'; f.frequency.value = kind === 'snare' ? 1400 : 6000; g.gain.value = kind === 'snare' ? 0.22 : 0.07;
    s.connect(f); f.connect(g); g.connect(this.out); s.start(t);
  }
  tick() {
    if (!this.on || !this.c) return;
    if (this.sfx.muted) { this.nextT = this.c.currentTime + 0.1; return; }
    const boss = this.mode === 'boss', bpm = boss ? 156 : 128, sd = 60 / bpm / 4;
    while (this.nextT < this.c.currentTime + 0.18) {
      const s = this.step % 16, bar = Math.floor(this.step / 16), t = this.nextT, root = this.roots[this.zone % 4] * (boss ? 0.5 : 1);
      if (s % 4 === 0) this.drum('kick', t);
      if (s === 4 || s === 12) this.drum('snare', t);
      if (s % 2 === 1 || (boss && s % 2 === 0)) this.drum('hat', t);
      const bassPat = [0, -1, 0, 7, -1, 0, 3, -1, 0, -1, 5, 0, -1, 7, 3, 5];
      if (bassPat[s] >= 0) this.note('sawtooth', root * Math.pow(2, bassPat[s] / 12), t, sd * 1.8, 0.16);
      const arp = [0, 2, 4, 3, 5, 3, 2, 4][((s >> 1) + bar * 3) % 8];
      if (s % 2 === 0) this.note('square', root * 4 * Math.pow(2, this.scale[arp] / 12), t, sd * 1.5, boss ? 0.05 : 0.035);
      this.nextT += sd; this.step++;
    }
  }
}
