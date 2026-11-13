// Уровень 3 «Штурм»: бой с гигантским катком. Сцена и робот — как в уровне 1, правила — boss.js.
import { THREE, makeRoller, glow } from './kit.js';
import { CONFIG } from '../../x2-run/src/config.js';
import { Level1 } from './l1.js';
import { BossGame, BOSS } from './boss.js';

const U = 1 / 48;
export class Level3 extends Level1 {
  constructor(ctx) {
    const game = new BossGame(), a = game.level.zones[BOSS.kind].arenaX;
    super({ ...ctx, game, range: [a - 1400, a + 2600], look: { rain: false, fog: '#2a1f4c', moon: '#ffa27a', sky: [[0, '#070820'], [0.36, '#241c52'], [0.47, '#8a4a7c'], [0.497, '#f09a6a'], [0.515, '#151222'], [1, '#06060b']] } });
    this.name = 'Штурм'; this.hint = 'Дорожный каток перекрыл улицу. Бригада бьёт вместе с вами.';
    this.hints = [[2, 'Держите огонь и цельтесь в каток'], [7, 'Прыгайте через таран и камни'], [12, 'Бонусы падают с неба — подбирайте']];
    this.bossV = new THREE.Group(); const r = makeRoller(); r.scale.setScalar(0.5); r.position.set(0.25, 0, -1.7); /* чуть позади дорожки: робот не прячется за катком */ this.bossV.add(r); this.bossV.visible = false; this.scene.add(this.bossV);
    this.rage = glow(this.bossV, '#ff4020', 7, 0, 2.5, 0.5, 0.8);
  }
  hud() { const h = super.hud(), b = this.game.boss; return { ...h, progress: b ? 1 - Math.max(0, b.hp) / b.maxHp : this.game.phase === 'won' ? 1 : 0, midLabel: 'Дорожный каток' }; }
  frame(dt) {
    super.frame(dt); const g = this.game, b = g.boss, v = this.bossV; v.visible = !!b;
    if (b) { const dying = b.state === 'dying'; v.position.set(b.x * U, dying ? -(2 - b.dyingT) * 0.5 : Math.sin(this.t * 22) * 0.03, 0); v.rotation.z = dying ? (2 - b.dyingT) * 0.08 : 0; v.scale.setScalar(1 + Math.max(0, b.flash) * 0.6); this.rage.material.opacity = 0.1 + 0.25 * (1 - b.hp / b.maxHp); }
    // камера ниже и сбоку: босс нависает
    const c = this.cam, cx = (g.cam.x + g.view.w / 2) * U; c.position.y -= 0.6; c.lookAt(cx, 3.3, 0);
  }
}
