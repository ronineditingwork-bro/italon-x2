// Игровое состояние и правила. Не зависит от графики и браузера: управляется вызовами step(dt) и командами.
import { CONFIG, DERIVED } from './config.js';
import { buildTrack, rowZ, zoneOfTime } from './track.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Game {
  constructor(seed = CONFIG.seed) {
    this.seed = seed;
    this.listeners = new Set();
    this.reset();
  }

  /** Подписка на события: lay, pickup, hit, zone, start, pause, resume, end. */
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(event) { for (const fn of this.listeners) fn(event); }

  /** Полный сброс мира и счёта (после «Ещё раз» ничего не остаётся от прошлого забега). */
  reset() {
    const { run } = CONFIG;
    this.track = buildTrack(this.seed);
    this.phase = 'menu';        // menu | running | paused | ended
    this.time = 0;
    this.z = 0;
    this.x = DERIVED.laneX[1];
    this.lane = 1;
    this.y = 0;
    this.vy = 0;
    this.lives = run.lives;
    this.invuln = 0;
    this.wide = 0;
    this.zone = 0;
    this.area = 0;
    this.tilesLaid = 0;
    this.nextRow = 0;
    this.laid = new Uint8Array(DERIVED.rows * CONFIG.grid.columns);
    this.pickupsTaken = 0;
    this.hits = 0;
    this.endReason = null;
  }

  start() {
    this.reset();
    this.phase = 'running';
    this.emit({ type: 'start' });
  }

  pause() { if (this.phase === 'running') { this.phase = 'paused'; this.emit({ type: 'pause' }); } }
  resume() { if (this.phase === 'paused') { this.phase = 'running'; this.emit({ type: 'resume' }); } }
  togglePause() { this.phase === 'running' ? this.pause() : this.resume(); }

  moveLane(dir) {
    if (this.phase !== 'running') return;
    this.lane = clamp(this.lane + dir, 0, CONFIG.grid.lanes - 1);
  }

  jump() {
    if (this.phase !== 'running' || this.y > 0.001) return;
    this.vy = CONFIG.run.jumpVelocity;
    this.y = 0.0001;
    this.emit({ type: 'jump' });
  }

  get zoneName() { return CONFIG.zones[this.zone].name; }
  get timeLeft() { return Math.max(0, CONFIG.run.duration - this.time); }
  get speed() { return CONFIG.run.speed; }
  get isWide() { return this.wide > 0; }

  /** Итоги забега для экрана результата. */
  summary() {
    const completed = Math.min(CONFIG.zones.length, Math.floor((this.time + 1e-6) / CONFIG.run.zoneDuration));
    return {
      area: this.area,
      tiles: this.tilesLaid,
      zonesCompleted: completed,
      zonesTotal: CONFIG.zones.length,
      lastZone: CONFIG.zones[this.zone].title,
      lives: this.lives,
      time: this.time,
      reason: this.endReason,
      pickups: this.pickupsTaken,
    };
  }

  end(reason) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.endReason = reason;
    this.emit({ type: 'end', reason, summary: this.summary() });
  }

  step(rawDt) {
    if (this.phase !== 'running') return;
    const { run, grid, collision } = CONFIG;
    const dt = clamp(rawDt, 0, 0.05);

    this.time = Math.min(run.duration, this.time + dt);
    this.z -= run.speed * dt;

    // перестроение
    const targetX = DERIVED.laneX[this.lane];
    const maxMove = run.laneChangeSpeed * dt;
    this.x += clamp(targetX - this.x, -maxMove, maxMove);

    // прыжок
    if (this.y > 0) {
      this.vy -= run.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.emit({ type: 'land' }); }
    }

    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    if (this.wide > 0) this.wide = Math.max(0, this.wide - dt);

    // зона
    const zone = zoneOfTime(this.time);
    if (zone !== this.zone) { this.zone = zone; this.emit({ type: 'zone', zone }); }

    // укладка рядов позади робота
    while (this.nextRow < DERIVED.rows && this.z <= rowZ(this.nextRow) - run.layLag) {
      this.layRow(this.nextRow++);
    }

    // коробки X2
    for (const p of this.track.pickups) {
      if (p.taken) continue;
      if (Math.abs(p.z - this.z) < collision.pickupZRadius && Math.abs(p.x - this.x) < collision.pickupXRadius && this.y < collision.pickupMaxHeight) {
        p.taken = true;
        this.wide = run.wideDuration;
        this.pickupsTaken++;
        this.emit({ type: 'pickup', id: p.id });
      }
    }

    // препятствия
    for (const o of this.track.obstacles) {
      if (o.hit || Math.abs(o.z - this.z) > (o.jumpable ? collision.jumpZRadius : collision.zRadius)) continue;
      if (Math.abs(o.x - this.x) > collision.xRadius * (o.w > 1 ? 1.15 : 1)) continue;
      const clears = o.jumpable && this.y >= o.h;
      if (clears || this.invuln > 0) continue;
      o.hit = true;
      this.lives--;
      this.hits++;
      this.invuln = run.hitProtection;
      this.emit({ type: 'hit', id: o.id, lives: this.lives });
      if (this.lives <= 0) { this.end('lives'); return; }
    }

    if (this.time >= run.duration) this.end('time');
  }

  /** Ряд укладывается: две ближайшие к роботу плитки, а при широкой укладке — все шесть. */
  layRow(row) {
    const cols = DERIVED.columnX.map((cx, i) => ({ i, d: Math.abs(cx - this.x) }));
    const chosen = this.wide > 0 ? cols : cols.sort((a, b) => a.d - b.d).slice(0, 2);
    chosen.sort((a, b) => a.i - b.i);
    let order = 0;
    for (const { i } of chosen) {
      const idx = row * CONFIG.grid.columns + i;
      if (this.laid[idx]) continue;                       // счёт только за впервые заменённые плитки
      this.laid[idx] = 1;
      this.tilesLaid++;
      this.area += CONFIG.grid.tileAreaM2;
      this.emit({ type: 'lay', row, col: i, order: order++, wide: this.wide > 0, scoring: row < DERIVED.runRows });
    }
  }
}
