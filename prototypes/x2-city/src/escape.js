// Уровень 1 «Побег»: правила. Бег, прыжки и стрельба — из проверенного движка x2-run; здесь добавлены
// бригада (помощники в клетках), гонящийся асфальтоукладчик и финиш без босса.
import { CONFIG } from '../../x2-run/src/config.js';
import { Game } from '../../x2-run/src/game.js';

export const ESCAPE = { zones: 2, cageEvery: 1150, cageW: 76, cageH: 96, chaseFrom: 150, chaseTo: 225, chaseBand: 440, chaseStun: 1.4, startGap: 440 };

export class EscapeGame extends Game {
  reset() {
    super.reset();
    this.endX = ESCAPE.zones * CONFIG.zoneLen - 500;
    this.helpers = 0; this.lost = 0;
    this.cages = [];
    for (let x = 900; x < this.endX - 400; x += ESCAPE.cageEvery) {
      let cx = x; while (!this.cageSpot(cx) && cx < x + 600) cx += 60;   // не над ямой и не внутри уступа
      if (this.cageSpot(cx)) this.cages.push({ x: cx, open: false });
    }
    this.chaser = { x: this.player.x - ESCAPE.startGap, stun: 0 };       // x — передний край (зубья)
  }
  cageSpot(x) {
    for (const g of this.level.gaps) if (x > g.x0 - 110 && x < g.x1 + 110) return false;
    for (const l of this.level.ledges) if (x > l.x0 - 70 && x < l.x1 + 70) return false;
    return true;
  }
  get total() { return this.cages.length; }

  step(dt) {
    super.step(dt);
    if (this.phase !== 'running') return;
    const p = this.player, c = this.chaser, k = Math.min(1, p.x / this.endX);
    // укладчик: медленнее бегущего робота, но не отстаёт дальше chaseBand — стоять на месте нельзя
    if (c.stun > 0) c.stun -= dt; else c.x += (ESCAPE.chaseFrom + (ESCAPE.chaseTo - ESCAPE.chaseFrom) * k) * dt;
    c.x = Math.max(c.x, p.x - ESCAPE.chaseBand);
    if (c.x > p.x - 26 && p.y > -150) { c.stun = ESCAPE.chaseStun; c.x = p.x - 60; p.invuln = 0; this.hurtPlayer(c.x - 200, 'chaser'); if (this.phase === 'running') { p.vx = 620; p.vy = -520; } }
    for (let i = this.enemies.length - 1; i >= 0; i--) { const e = this.enemies[i]; if (!e.air && e.x < c.x - 10) { this.enemies.splice(i, 1); this.emit('crush', { x: e.x, y: e.y }); } }
    // клетки: открываются выстрелом или касанием
    for (const cg of this.cages) {
      if (cg.open || Math.abs(cg.x - p.x) > 1700) continue;
      let hit = Math.abs(p.x - cg.x) < ESCAPE.cageW / 2 + 24 && p.y > -ESCAPE.cageH;
      for (let i = this.bullets.length - 1; i >= 0 && !hit; i--) { const b = this.bullets[i]; if (Math.abs(b.x - cg.x) < ESCAPE.cageW / 2 + 8 && b.y > -ESCAPE.cageH - 8 && b.y < 6) { hit = true; if (!b.pierce) this.bullets.splice(i, 1); } }
      if (hit) { cg.open = true; this.helpers++; this.area += 1.08; this.emit('rescue', { x: cg.x, helpers: this.helpers }); }
      else if (cg.x < c.x - 30) { cg.open = true; this.lost++; this.emit('cageLost', { x: cg.x }); }
    }
    if (p.x >= this.endX) this.finish(true);
  }
  stepBoss() { /* босса на этом уровне нет — он гонится сзади */ }
  stepZone() { const z = Math.max(0, Math.min(ESCAPE.zones - 1, Math.floor(this.player.x / CONFIG.zoneLen))); if (z > this.zone) { this.zone = z; this.emit('zone', { zone: z }); } }
  stepSpawns() { if (this.player.x < this.endX - 900) super.stepSpawns(); }

  loseHelper() { if (this.helpers > 0) { this.helpers--; this.lost++; this.emit('helperLost', { helpers: this.helpers }); } }
  hurtPlayer(fromX, src = '') { const h = this.player.hearts; super.hurtPlayer(fromX, src); if (this.player.hearts < h) this.loseHelper(); }
  fall() { super.fall(); this.loseHelper(); }
  summary() { return { ...super.summary(), helpers: this.helpers, total: this.total }; }
}
