// Музыка синтезируется кодом (WebAudio): тёмный пульс баса, мягкий аккорд и своя короткая мелодия. Для каждого уровня — свой лад и темп.
const SETS = [ { bpm: 104, roots: [110, 87.31, 130.81, 98], mel: [0, 3, 7, 10, 7, 3, 12, 10, 7, 3, 5, 7, 3, 0, -2, 0] },
  { bpm: 116, roots: [98, 116.54, 87.31, 130.81], mel: [7, 5, 3, 0, 3, 5, 10, 7, 12, 10, 7, 5, 3, 5, 0, 3] },
  { bpm: 132, roots: [82.41, 82.41, 98, 73.42], mel: [0, 12, 0, 10, 0, 7, 3, 5, 0, 12, 0, 15, 12, 10, 7, 3] },
  { bpm: 140, roots: [130.81, 98, 110, 87.31], mel: [0, 4, 7, 12, 7, 4, 9, 7, 4, 7, 12, 16, 12, 9, 7, 4] } ];
export class Music {
  constructor(sfx) { this.sfx = sfx; this.on = false; this.step = 0; this.set = SETS[0]; this.tense = 0; }
  get c() { return this.sfx.ctx; }
  setLevel(i) { this.set = SETS[i % SETS.length]; }
  start() { if (!this.c || this.on) return; this.on = true; this.step = 0; this.next = this.c.currentTime + 0.1;
    if (!this.out) { this.out = this.c.createGain(); this.out.gain.value = 0.5; this.lp = this.c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 1500; this.lp.connect(this.out); this.out.connect(this.sfx.master); }
    this.timer = setInterval(() => this.tick(), 50); }
  stop() { this.on = false; clearInterval(this.timer); }
  note(type, f, t, dur, vol, att = 0.01, dest = this.lp) { const c = this.c, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05); }
  kick(t) { const c = this.c, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.14); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.22); }
  tick() { if (!this.on || !this.c) return; if (this.sfx.muted) { this.next = this.c.currentTime + 0.1; return; }
    const S = this.set, sd = 60 / S.bpm / 4;
    while (this.next < this.c.currentTime + 0.2) { const s = this.step % 16, bar = Math.floor(this.step / 16), t = this.next, root = S.roots[bar % 4];
      if (s % 4 === 0) this.kick(t); if (s % 2 === 0) this.note('sawtooth', root / 2, t, sd * 1.7, 0.2);
      if (s === 0) for (const semi of [0, 7, 15]) this.note('triangle', root * 2 * Math.pow(2, semi / 12), t, sd * 15, 0.045, 0.6);
      if (bar % 4 >= 2 && (s % 4 === 2 || s === 7 || s === 13)) this.note('square', root * 4 * Math.pow(2, S.mel[(s + bar * 5) % 16] / 12), t, sd * 2.5, 0.028);
      if (this.tense > 0.5 && s % 2 === 1) this.note('square', root * 8, t, sd * 0.4, 0.012);
      this.next += sd; this.step++; } }
}
