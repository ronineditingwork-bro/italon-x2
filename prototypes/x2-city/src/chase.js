// Уровень 4 «Погоня к рассвету»: правила. Камера за спиной, три полосы. Робот сам бежит вперёд за экскаватором:
// смена полосы, прыжок через барьер, выстрел по «браку» и клеткам; обломки нужно объезжать.
import { createRng } from '../../x2-run/src/rng.js';

export const CHASE = { lanes: [-2.4, 0, 2.4], dist: 1300, rowEvery: 13, first: 45, v0: 15, v1: 25, hearts: 5, maxHearts: 7, invuln: 1.3, jumpV: 9, grav: 26, fireEvery: 0.16, shotSpeed: 60, range: 34, helpers: 4, areaPerM: 0.72 };
const C = CHASE, FIXED = 1 / 60;

export class ChaseGame {
  constructor(seed = 20261114) { this.seed = seed; this.listeners = new Set(); this.input = { left: false, right: false, up: false, down: false, fire: false }; this.reset(); }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, d = {}) { const e = { type, ...d }; for (const fn of this.listeners) fn(e); }
  reset() {
    const rng = createRng(this.seed); this.phase = 'menu'; this.time = 0; this.acc = 0; this.d = 0; this.kills = 0; this.bonus = 0;
    this.player = { lane: 1, x: 0, y: 0, vy: 0, hearts: C.hearts, invuln: 0, cd: 0, hurt: 0, run: 0 }; this.pl = this.pr = false;
    this.helpers = C.helpers; this.lost = 0; this.bullets = []; this.objs = []; let cages = 0;
    for (let i = 0, z = C.first; z < C.dist - 30; i++, z += C.rowEvery) { const k = z / C.dist, row = [null, null, null];
      const n = rng.next() < 0.35 + k * 0.4 ? 2 : 1, kinds = k < 0.12 ? ['barrier', 'brak'] : ['barrier', 'brak', 'brak', 'boulder'];
      for (let j = 0; j < n; j++) { const l = rng.int(0, 2); if (!row[l]) row[l] = rng.pick(kinds); }
      if (i % 7 === 3) { const free = [0, 1, 2].filter(l => !row[l]); row[rng.pick(free)] = 'cage'; cages++; } else if (i % 16 === 9) { const free = [0, 1, 2].filter(l => !row[l]); row[rng.pick(free)] = 'heart'; }
      row.forEach((kind, lane) => { if (kind) this.objs.push({ kind, lane, x: C.lanes[lane], z, hp: kind === 'brak' ? 2 : 1, done: false, flash: 0 }); }); }
    this.total = C.helpers + cages;
  }
  start() { this.reset(); this.phase = 'running'; this.emit('start'); }
  pressJump() { const p = this.player; if (this.phase === 'running' && p.y <= 0) { p.vy = C.jumpV; p.y = 0.001; this.emit('jump'); } }
  releaseJump() {}
  get speed() { return C.v0 + (C.v1 - C.v0) * Math.min(1, this.d / C.dist); }
  get area() { return this.d * C.areaPerM + this.bonus; }
  update(dt) { if (this.phase !== 'running') return; this.acc += Math.min(dt, 0.1); while (this.acc >= FIXED) { this.acc -= FIXED; this.step(FIXED); if (this.phase !== 'running') break; } }
  step(dt) {
    this.time += dt; const p = this.player, inp = this.input;
    if (inp.left && !this.pl && p.lane > 0) p.lane--; if (inp.right && !this.pr && p.lane < 2) p.lane++; this.pl = inp.left; this.pr = inp.right;
    p.x += (C.lanes[p.lane] - p.x) * Math.min(1, dt * 14);
    if (p.y > 0) { p.vy -= C.grav * dt; p.y += p.vy * dt; if (p.y <= 0) { p.y = 0; p.vy = 0; this.emit('land'); } }
    for (const k of ['invuln', 'cd', 'hurt']) if (p[k] > 0) p[k] -= dt;
    this.d += this.speed * (p.hurt > 0 ? 0.55 : 1) * dt; p.run += dt * 16;
    if (inp.fire && p.cd <= 0) { p.cd = C.fireEvery; this.bullets.push({ x: p.x, z: this.d + 1, life: C.range / C.shotSpeed }); this.emit('shoot', { weapon: 'slab' }); }
    for (let i = this.bullets.length - 1; i >= 0; i--) { const b = this.bullets[i]; b.z += C.shotSpeed * dt; b.life -= dt; let dead = b.life <= 0;
      for (const o of this.objs) { if (dead) break; if (o.done || Math.abs(o.x - b.x) > 1 || Math.abs(o.z - b.z) > 1) continue; dead = true;
        if (o.kind === 'brak') { o.hp--; o.flash = 0.1; this.emit('enemyHit', { x: o.x, z: o.z }); if (o.hp <= 0) { o.done = true; this.kills++; this.bonus += 0.36; this.emit('kill', { x: o.x, z: o.z, kind: 'runner' }); } }
        else if (o.kind === 'cage') this.rescue(o); else if (o.kind === 'heart') dead = false; else this.emit('ping', { x: o.x, z: o.z }); }
      if (dead) this.bullets.splice(i, 1); }
    for (const o of this.objs) { if (o.flash > 0) o.flash -= dt; if (o.done || Math.abs(o.z - this.d) > 0.9 || Math.abs(o.x - p.x) > 1.1) continue;
      if (o.kind === 'cage') this.rescue(o); else if (o.kind === 'heart') { o.done = true; p.hearts = Math.min(C.maxHearts, p.hearts + 1); this.emit('pickup', { kind: 'heart', x: o.x, z: o.z }); }
      else if (o.kind === 'barrier' && p.y > 0.75) continue; else if (p.invuln <= 0) { o.done = o.kind === 'brak'; this.hurt(o); } }
    if (this.phase === 'running' && this.d >= C.dist) { this.phase = 'won'; this.emit('win', this.summary()); }
  }
  rescue(o) { o.done = true; this.helpers++; this.bonus += 1.08; this.emit('rescue', { x: o.x, z: o.z, helpers: this.helpers }); }
  hurt(o) { const p = this.player; p.hearts--; p.invuln = C.invuln; p.hurt = 0.45; if (this.helpers > 0) { this.helpers--; this.lost++; this.emit('helperLost', { helpers: this.helpers }); }
    this.emit('hit', { hearts: p.hearts, x: o.x, z: o.z }); if (p.hearts <= 0) { this.phase = 'over'; this.emit('over', this.summary()); } }
  summary() { return { area: this.area, helpers: this.helpers, total: this.total, time: this.time, defects: this.kills, won: this.phase === 'won' }; }
}
