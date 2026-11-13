// Уровень 2 «Захват двора»: правила. Вид сверху; двор — сетка клеток. Робот мостит клетку, на которой стоит,
// помощники мостят соседние; «брак» идёт с краёв и ломает плитку под собой. Победа — замощено GOAL двора.
import { createRng } from '../../x2-run/src/rng.js';

export const YARD = { cols: 21, rows: 15, cell: 1.6, goal: 0.85, speed: 6.2, hearts: 5, maxHearts: 7, invuln: 1.6, fireEvery: 0.15, shotSpeed: 24, range: 11.5,
  dash: 0.22, dashSpeed: 17, dashCd: 0.9, helperSpeed: 4.6, layTime: 0.45, startHelpers: 2, cages: 5, maxEnemies: 14, crack: 1.7, cellArea: 1.44 };
const FIXED = 1 / 60, Y = YARD;

export class YardGame {
  constructor(seed = 20261113) { this.seed = seed; this.listeners = new Set(); this.input = { left: false, right: false, up: false, down: false, fire: false }; this.reset(); }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, d = {}) { const e = { type, ...d }; for (const fn of this.listeners) fn(e); }
  get w() { return Y.cols * Y.cell; } get h() { return Y.rows * Y.cell; }
  cellAt(x, z) { const ix = Math.floor((x + this.w / 2) / Y.cell), iz = Math.floor((z + this.h / 2) / Y.cell); return ix < 0 || iz < 0 || ix >= Y.cols || iz >= Y.rows ? -1 : iz * Y.cols + ix; }
  cx(i) { return (i % Y.cols + 0.5) * Y.cell - this.w / 2; } cz(i) { return (Math.floor(i / Y.cols) + 0.5) * Y.cell - this.h / 2; }

  reset() {
    this.rng = createRng(this.seed); this.phase = 'menu'; this.time = 0; this.acc = 0; this.nextId = 1;
    this.cells = new Uint8Array(Y.cols * Y.rows); this.claim = new Uint8Array(Y.cols * Y.rows); this.laid = 0; this.bonus = 0;
    this.player = { x: 0, z: 0, fx: 1, fz: 0, ax: 1, az: 0, hearts: Y.hearts, invuln: 0, cd: 0, dash: 0, dashCd: 0, moving: false, hurt: 0, run: 0 };
    this.helpers = []; for (let i = 0; i < Y.startHelpers; i++) this.addHelper(-1.5 + i * 3, 1.5);
    this.lost = 0; this.enemies = []; this.bullets = []; this.items = []; this.spawnT = 2.5; this.spawned = 0; this.kills = 0;
    this.cages = []; for (let i = 0; i < Y.cages; i++) { const a = i / Y.cages * 6.283 + 0.6; this.cages.push({ x: Math.cos(a) * this.w * 0.36, z: Math.sin(a) * this.h * 0.36, open: false }); }
    this.total = Y.startHelpers + Y.cages;
    for (const d of [-1, 0, 1]) for (const e of [-1, 0, 1]) this.lay(this.cellAt(d * Y.cell, e * Y.cell), true);
  }
  addHelper(x, z) { this.helpers.push({ id: this.nextId++, x, z, cell: -1, t: 0, moving: false, dx: 1, dz: 0 }); }
  start() { this.reset(); this.phase = 'running'; this.emit('start'); }
  pressJump() { const p = this.player; if (this.phase === 'running' && p.dashCd <= 0) { p.dash = Y.dash; p.dashCd = Y.dashCd; p.invuln = Math.max(p.invuln, Y.dash + 0.1); this.emit('jump'); } }
  releaseJump() {}
  get frac() { return this.laid / this.cells.length; }
  get area() { return this.laid * Y.cellArea + this.bonus; }

  lay(i, quiet) { if (i < 0 || this.cells[i]) return false; this.cells[i] = 1; this.claim[i] = 0; this.laid++; if (!quiet) this.emit('lay', { i }); return true; }
  unlay(i) { if (i < 0 || !this.cells[i]) return; this.cells[i] = 0; this.laid--; this.emit('unlay', { i }); }

  update(dt) { if (this.phase !== 'running') return; this.acc += Math.min(dt, 0.1); while (this.acc >= FIXED) { this.acc -= FIXED; this.step(FIXED); if (this.phase !== 'running') break; } }

  step(dt) {
    this.time += dt; const p = this.player, inp = this.input;
    // движение: 8 направлений, рывок
    let dx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), dz = (inp.down ? 1 : 0) - (inp.up ? 1 : 0); const l = Math.hypot(dx, dz);
    p.moving = l > 0; if (l) { dx /= l; dz /= l; p.fx = dx; p.fz = dz; }
    if (p.dash > 0) { p.dash -= dt; p.x += p.fx * Y.dashSpeed * dt; p.z += p.fz * Y.dashSpeed * dt; } else if (l) { p.x += dx * Y.speed * dt; p.z += dz * Y.speed * dt; p.run += dt * 14; }
    const mx = this.w / 2 - 0.4, mz = this.h / 2 - 0.4; p.x = Math.max(-mx, Math.min(mx, p.x)); p.z = Math.max(-mz, Math.min(mz, p.z));
    for (const k of ['invuln', 'cd', 'dashCd', 'hurt']) if (p[k] > 0) p[k] -= dt;
    this.lay(this.cellAt(p.x, p.z));
    // огонь: по ближайшему врагу в радиусе, иначе — куда смотрит робот
    let near = null, nd = Y.range; for (const e of this.enemies) { const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < nd) { nd = d; near = e; } }
    if (near) { p.ax = (near.x - p.x) / (nd || 1); p.az = (near.z - p.z) / (nd || 1); } else { p.ax = p.fx; p.az = p.fz; }
    if (inp.fire && p.cd <= 0) { p.cd = Y.fireEvery; this.bullets.push({ x: p.x + p.ax * 0.9, z: p.z + p.az * 0.9, vx: p.ax * Y.shotSpeed, vz: p.az * Y.shotSpeed, life: Y.range / Y.shotSpeed }); this.emit('shoot', { weapon: 'slab', x: p.x, z: p.z }); }
    this.stepBullets(dt); this.stepHelpers(dt); this.stepEnemies(dt); this.stepCages(); this.stepItems(dt);
    if (this.phase === 'running' && this.frac >= Y.goal) { this.phase = 'won'; this.emit('win', this.summary()); }
  }

  stepBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) { const b = this.bullets[i]; b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt; let dead = b.life <= 0;
      for (const e of this.enemies) { if (dead) break; if (Math.hypot(e.x - b.x, e.z - b.z) < e.r + 0.35) { dead = true; this.damage(e, 1, b); } }
      for (const c of this.cages) if (!dead && !c.open && Math.hypot(c.x - b.x, c.z - b.z) < 0.9) { dead = true; this.openCage(c); }
      if (dead) this.bullets.splice(i, 1); }
  }
  damage(e, d, b) { e.hp -= d; e.flash = 0.1; this.emit('enemyHit', { x: b.x, z: b.z }); if (e.hp > 0) return;
    this.enemies.splice(this.enemies.indexOf(e), 1); this.kills++; this.bonus += e.heavy ? 2.16 : 0.36; this.emit('kill', { x: e.x, z: e.z, kind: e.heavy ? 'heavy' : 'runner' });
    if (this.rng.next() < (e.heavy ? 0.6 : 0.07) && this.items.length < 3) this.items.push({ x: e.x, z: e.z, life: 10 }); }
  openCage(c) { c.open = true; this.addHelper(c.x, c.z); this.bonus += 1.08; this.emit('rescue', { x: c.x, z: c.z, helpers: this.helpers.length }); }
  stepCages() { const p = this.player; for (const c of this.cages) if (!c.open && Math.hypot(c.x - p.x, c.z - p.z) < 1.3) this.openCage(c); }
  stepItems(dt) { const p = this.player; for (let i = this.items.length - 1; i >= 0; i--) { const it = this.items[i]; it.life -= dt; if (Math.hypot(it.x - p.x, it.z - p.z) < 1.1) { p.hearts = Math.min(Y.maxHearts, p.hearts + 1); this.emit('pickup', { kind: 'heart', x: it.x, z: it.z }); this.items.splice(i, 1); } else if (it.life <= 0) this.items.splice(i, 1); } }

  /** Помощник берёт ближайшую незамощенную клетку у края плитки рядом с роботом. */
  pickCell(h) { const p = this.player, C = Y.cols; let best = -1, bd = 1e9;
    for (let i = 0; i < this.cells.length; i++) { if (this.cells[i] || this.claim[i]) continue; const x = this.cx(i), z = this.cz(i), dp = Math.hypot(x - p.x, z - p.z); if (dp > 8) continue;
      const ix = i % C, edge = (ix > 0 && this.cells[i - 1]) || (ix < C - 1 && this.cells[i + 1]) || this.cells[i - C] || this.cells[i + C]; if (!edge) continue;
      const d = Math.hypot(x - h.x, z - h.z) + dp * 0.4; if (d < bd) { bd = d; best = i; } }
    return best; }
  stepHelpers(dt) { const p = this.player;
    this.helpers.forEach((h, k) => { if (h.cell >= 0 && this.cells[h.cell]) h.cell = -1;
      if (h.cell < 0) { h.cell = this.pickCell(h); if (h.cell >= 0) { this.claim[h.cell] = 1; h.t = 0; } }
      let tx, tz; if (h.cell >= 0) { tx = this.cx(h.cell); tz = this.cz(h.cell); } else { const a = k * 2.4 + this.time * 0.3; tx = p.x + Math.cos(a) * 2.2; tz = p.z + Math.sin(a) * 2.2; }
      const dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz); h.moving = d > 0.25;
      if (h.moving) { const s = Math.min(d, Y.helperSpeed * dt); h.x += dx / d * s; h.z += dz / d * s; h.dx = dx / d; h.dz = dz / d; }
      else if (h.cell >= 0) { h.t += dt; if (h.t >= Y.layTime) { this.lay(h.cell); h.cell = -1; } } }); }

  stepEnemies(dt) { const p = this.player;
    this.spawnT -= dt; if (this.spawnT <= 0 && this.enemies.length < Y.maxEnemies) { this.spawnT = Math.max(0.75, 2.3 - this.frac * 1.9); this.spawned++;
      const heavy = this.frac > 0.3 && this.spawned % 8 === 0; let ex, ez, k;
      // не появляться рядом с роботом, даже если он стоит у края двора
      for (let n = 0; n < 6; n++) { const a = this.rng.next() * 6.283; ex = Math.cos(a); ez = Math.sin(a); k = Math.min((this.w / 2 + 1.5) / Math.abs(ex || 1e-6), (this.h / 2 + 1.5) / Math.abs(ez || 1e-6)); if (Math.hypot(ex * k - p.x, ez * k - p.z) > 9) break; }
      this.enemies.push({ id: this.nextId++, x: ex * k, z: ez * k, hp: heavy ? 8 : 2, r: heavy ? 1 : 0.55, heavy, speed: heavy ? 1.7 : this.rng.range(2.3, 3.3), crack: 0, flash: 0, dx: -ex, dz: -ez }); }
    for (const e of this.enemies) { if (e.flash > 0) e.flash -= dt; const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz) || 1; e.dx = dx / d; e.dz = dz / d; e.x += e.dx * e.speed * dt; e.z += e.dz * e.speed * dt;
      const c = this.cellAt(e.x, e.z); if (c >= 0 && this.cells[c]) { e.crack += dt * (e.heavy ? 2 : 1); if (e.crack >= Y.crack) { e.crack = 0; this.unlay(c); } }
      if (d < e.r + 0.55 && p.invuln <= 0) this.hurt(e); } }
  hurt(e) { const p = this.player; p.hearts--; p.invuln = Y.invuln; p.hurt = 0.4; p.x -= e.dx * -1.2; p.z -= e.dz * -1.2;
    if (this.helpers.length > 1) { this.helpers.pop(); this.lost++; this.emit('helperLost', { helpers: this.helpers.length }); }
    this.emit('hit', { hearts: p.hearts }); if (p.hearts <= 0) { this.phase = 'over'; this.emit('over', this.summary()); } }
  summary() { return { area: this.area, helpers: this.helpers.length, total: this.total, time: this.time, defects: this.kills, won: this.phase === 'won' }; }
}
