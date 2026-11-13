// Уровень 3 «Штурм»: правила. Ровная арена и бой с дорожным катком из x2-run; бригада бьёт вместе с роботом.
import { CONFIG } from '../../x2-run/src/config.js';
import { Game } from '../../x2-run/src/game.js';

export const BOSS = { kind: 2, hpMul: 2.4, helpers: 6, throwEvery: 0.5, drops: ['fan', 'rapid', 'heart', 'heavy'] };

export class BossGame extends Game {
  constructor(seed) { super(seed); Object.assign(this.level, { gaps: [], ledges: [], spawns: [], drones: [], patches: [] }); this.reset(); }
  reset() {
    super.reset(); const z = this.level.zones[BOSS.kind], p = this.player;
    this.zone = this.bossesDefeated = BOSS.kind; p.x = p.safeX = z.arenaX + 20; /* сразу за чертой арены: босс выходит без пробежки */ this.cam.x = p.x - this.view.w * CONFIG.player.camLead;
    this.laidX = p.x - CONFIG.lay.lag; this.nextTileX = Math.floor(this.laidX / CONFIG.lay.tileLen) * CONFIG.lay.tileLen + CONFIG.lay.tileLen;
    this.helpers = this.total = BOSS.helpers; this.lost = 0; this.throwT = 2; this.dropI = 0;
  }
  makeBoss(zone) { const b = super.makeBoss(zone); b.hp = b.maxHp = Math.round(b.hp * BOSS.hpMul); return b; }
  step(dt) {
    super.step(dt); const b = this.boss; if (this.phase !== 'running' || !b || b.state !== 'fight') return;
    this.throwT -= dt; if (this.helpers > 0 && this.throwT <= 0) { this.throwT = BOSS.throwEvery * BOSS.helpers / this.helpers; this.damageBoss(b, 1); this.emit('helperShot', { x: b.x - b.w * 0.3, y: b.y - b.h * 0.6 }); }
    // каждые 25 % здоровья босса с неба падает бонус
    if (b.state === 'fight' && b.hp / b.maxHp < 0.75 - this.dropI * 0.25 && this.dropI < 3) this.items.push(this.makeItem(BOSS.drops[this.dropI++], this.cam.x + this.view.w * 0.3, -300));
  }
  finishBoss() { super.finishBoss(); if (this.phase === 'running') this.finish(true); }
  stepZone() {}
  loseHelper() { if (this.helpers > 0) { this.helpers--; this.lost++; this.emit('helperLost', { helpers: this.helpers }); } }
  hurtPlayer(fromX, src = '') { const h = this.player.hearts; super.hurtPlayer(fromX, src); if (this.player.hearts < h) this.loseHelper(); }
  summary() { return { ...super.summary(), helpers: this.helpers, total: this.total }; }
}
