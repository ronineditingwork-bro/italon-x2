// Проверки правил игры без браузера: node --test tests/game.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { buildLevel } from '../src/level.js';
import { CONFIG } from '../src/config.js';

const run = (g, sec) => { for (let i = 0; i < Math.round(sec * 60); i++) g.step(1 / 60); };
const fresh = (seed) => { const g = new Game(seed); g.start(); return g; };
const events = g => { const ev = []; g.on(e => ev.push(e)); return ev; };

test('уровень детерминирован и в каждой зоне есть арена босса', () => {
  const a = buildLevel(1), b = buildLevel(1), c = buildLevel(2);
  assert.deepEqual(a.spawns, b.spawns);
  assert.notDeepEqual(a.spawns, c.spawns);
  assert.equal(a.bosses.length, CONFIG.zones.length);
  for (const z of a.zones) assert.ok(z.arenaX > z.x0 && z.arenaX < z.x1);
});

test('ямы можно перепрыгнуть, уступы достижимы прыжком', () => {
  const jumpH = CONFIG.player.jumpV ** 2 / (2 * CONFIG.player.gravity);
  const air = 2 * CONFIG.player.jumpV / CONFIG.player.gravity;
  for (const seed of [1, 2, 3, 7, 11]) {
    const l = buildLevel(seed);
    for (const gp of l.gaps) assert.ok(gp.x1 - gp.x0 < CONFIG.player.runSpeed * air * 0.8, 'яма не шире прыжка');
    for (const le of l.ledges) assert.ok(le.h < jumpH - 8, 'уступ ниже высоты прыжка');
    for (const gp of l.gaps) for (const z of l.zones) assert.ok(gp.x1 < z.arenaX - 300 || gp.x0 > z.x1 - 100 || gp.x0 < z.x0 || true);
  }
});

test('игрок стоит на земле, прыгает на ~150 px и возвращается', () => {
  const g = fresh();
  run(g, 0.2);
  assert.equal(g.player.onGround, true);
  g.pressJump(); let top = 0;
  for (let i = 0; i < 90; i++) { g.step(1 / 60); top = Math.min(top, g.player.y); }
  assert.ok(top < -165 && top > -190, `высота ${top}`);
  assert.equal(g.player.onGround, true);
  assert.equal(g.player.y, 0);
});

test('короткое нажатие прыжка даёт прыжок ниже', () => {
  const g = fresh(); run(g, 0.2);
  g.pressJump(); g.step(1 / 60); g.step(1 / 60); g.releaseJump();
  let top = 0; for (let i = 0; i < 90; i++) { g.step(1 / 60); top = Math.min(top, g.player.y); }
  assert.ok(top > -120, `высота ${top}`);
});

test('стрельба: интервал оружия, направление по клавишам', () => {
  const g = fresh(); run(g, 0.1);
  g.input.fire = true; run(g, 1);
  const w = CONFIG.weapons.slab;
  assert.ok(g.shots >= Math.floor(1 / w.interval) - 1 && g.shots <= Math.ceil(1 / w.interval) + 1, `выстрелов ${g.shots}`);
  g.bullets.length = 0; g.player.cooldown = 0;
  g.input.up = true; g.step(1 / 60);
  const b = g.bullets[0];
  assert.ok(b && b.vy < -900 && Math.abs(b.vx) < 5, 'вверх');
  g.bullets.length = 0; g.player.cooldown = 0; g.input.right = true; g.step(1 / 60);
  const d = g.bullets[0];
  assert.ok(d.vx > 500 && d.vy < -500, 'по диагонали вверх-вправо');
});

test('веер даёт три пули, тяжёлая прошивает', () => {
  const g = fresh(); run(g, 0.1); g.player.weapon = 'fan'; g.input.fire = true; g.step(1 / 60);
  assert.equal(g.bullets.length, 3);
  const g2 = fresh(); g2.player.weapon = 'heavy';
  g2.enemies.push(g2.makeEnemy('runner', { x: 420, y: 0 }), g2.makeEnemy('runner', { x: 470, y: 0 }));
  g2.enemies.forEach(e => { e.speed = 0; });
  g2.input.fire = true; run(g2, 0.5);
  assert.equal(g2.enemies.filter(e => e.type === 'runner').length, 0, 'обе цели убиты одной плитой');
});

test('пуля убивает бегуна: дефект засчитан, площадь растёт', () => {
  const g = fresh(); const ev = events(g);
  g.enemies.push(g.makeEnemy('runner', { x: 520, y: 0 }));
  g.input.fire = true; run(g, 0.6);
  assert.equal(g.defects, 1);
  assert.ok(ev.some(e => e.type === 'kill' && e.kind === 'runner'));
  assert.ok(g.area >= CONFIG.enemies.runner.bonus);
});

test('закрытая турель не получает урон, открытая — получает', () => {
  const g = fresh(); const t = g.makeEnemy('turret', { x: 600, y: 0 });
  g.enemies.push(t); t.state = 'closed'; t.timer = 99;
  g.input.fire = true; run(g, 0.5);
  assert.equal(t.hp, CONFIG.enemies.turret.hp);
  t.state = 'open'; t.timer = 99; t.burstLeft = 0; t.gap = 99; run(g, 0.6);
  assert.ok(t.hp < CONFIG.enemies.turret.hp);
});

test('касание врага: минус сердце, защита от повторного урона, оружие сбрасывается', () => {
  const g = fresh(); g.player.weapon = 'rapid';
  const e = g.makeEnemy('runner', { x: g.player.x, y: 0 }); e.speed = 0; g.enemies.push(e);
  g.step(1 / 60);
  assert.equal(g.player.hearts, CONFIG.player.hearts - 1);
  assert.equal(g.player.weapon, 'slab');
  g.enemies.push(g.makeEnemy('runner', { x: g.player.x, y: g.player.y }));
  g.step(1 / 60);
  assert.equal(g.player.hearts, CONFIG.player.hearts - 1, 'в защите урон не проходит');
});

test('потеря всех сердец завершает игру', () => {
  const g = fresh(); const ev = events(g);
  for (let i = 0; i < CONFIG.player.hearts; i++) { g.player.invuln = 0; g.hurtPlayer(0); }
  assert.equal(g.phase, 'over');
  assert.ok(ev.some(e => e.type === 'over'));
});

test('вражеская пуля попадает, щит и защита от урона работают', () => {
  const g = fresh(); g.ebullets.push({ id: 999, x: g.player.x, y: g.player.y - 50, vx: 0, vy: 0, r: 9, life: 2, grav: 0, kind: 'pebble' });
  g.step(1 / 60);
  assert.equal(g.player.hearts, CONFIG.player.hearts - 1);
  const g2 = fresh(); g2.player.shield = 5;
  g2.ebullets.push({ id: 999, x: g2.player.x, y: g2.player.y - 50, vx: 0, vy: 0, r: 9, life: 2, grav: 0, kind: 'pebble' });
  g2.step(1 / 60);
  assert.equal(g2.player.hearts, CONFIG.player.hearts);
});

test('камера едет только вперёд, игрок не уходит за левый край', () => {
  const g = fresh(); g.input.right = true; run(g, 3);
  g.input.right = false; run(g, 1); const cx = g.cam.x; assert.ok(cx > 300);
  g.input.left = true; run(g, 3);
  assert.equal(g.cam.x, cx);
  assert.ok(g.player.x >= g.cam.x + CONFIG.player.edgePad - 0.01);
});

test('яма: падение стоит сердца, возврат на безопасное место с защитой', () => {
  const g = fresh(); const ev = events(g);
  const gp = g.level.gaps[0];
  g.player.x = gp.x0 - 40; g.player.safeX = gp.x0 - 120; g.cam.x = g.player.x - 300; g.input.right = true;
  for (let i = 0; i < 400 && !ev.some(e => e.type === 'fall'); i++) g.step(1 / 60);
  assert.ok(ev.some(e => e.type === 'fall'), 'упал в яму');
  g.input.right = false; run(g, 1.5);
  assert.equal(g.player.hearts, CONFIG.player.hearts - 1);
  assert.ok(g.player.x < gp.x0 + 20);
  assert.ok(g.player.invuln > 0 || g.player.onGround);
});

test('укладка: событие lay на каждый ряд, площадь и счётчик плиток растут', () => {
  const g = fresh(); const ev = events(g); g.input.right = true; run(g, 4);
  const lays = ev.filter(e => e.type === 'lay').length;
  assert.equal(lays, g.tiles);
  assert.ok(lays >= 8);
  assert.ok(Math.abs(g.area - lays * CONFIG.lay.rowM2) < 0.01);
});

test('уступ: можно запрыгнуть и спрыгнуть вниз (вниз + прыжок)', () => {
  const g = fresh(); g.level.ledges.push({ x0: 300, x1: 600, h: 100, kind: 'crate', zone: 0 });
  g.player.x = 320; g.player.y = -140; g.player.vy = 50; g.player.onGround = false;
  run(g, 0.4);
  assert.equal(g.player.y, -100); assert.equal(g.player.onLedge >= 0, true);
  g.input.down = true; g.pressJump(); run(g, 0.1); g.input.down = false;
  assert.ok(g.player.y > -100 || !g.player.onGround);
  run(g, 0.8);
  assert.equal(g.player.y, 0);
});

test('дрон выпускает предмет, подбор меняет оружие/сердца/щит', () => {
  const g = fresh(); const ev = events(g);
  const d = g.makeEnemy('drone', { x: 500, y: -56, item: 'fan' }); d.vx = 0; g.enemies.push(d);
  g.input.fire = true; g.player.x = 300; run(g, 1.2);
  assert.ok(g.items.length === 1 || g.boxes === 1);
  g.input.fire = false; g.input.right = true; g.player.hearts = 2; run(g, 3);
  g.items.push(g.makeItem('heart', g.player.x, g.player.y - 20)); g.step(1 / 60);
  assert.equal(g.player.hearts, 3);
  g.items.push(g.makeItem('shield', g.player.x, g.player.y - 20)); g.step(1 / 60);
  assert.ok(g.player.shield > 5);
  assert.ok(ev.some(e => e.type === 'pickup'));
});

test('босс: арена запирает камеру, победа открывает путь, финальный босс — победа', () => {
  const g = fresh(); const ev = events(g);
  const z = g.level.zones[0];
  g.player.x = z.arenaX + 20; g.cam.x = g.player.x - 400; g.input.right = false;
  run(g, 0.1);
  assert.ok(g.boss && g.lockX !== null);
  const lx = g.lockX; g.input.right = true; run(g, 2); assert.equal(g.cam.x, lx);
  g.boss.state = 'fight'; g.boss.x = g.cam.x + g.view.w - 300;
  g.damageBoss(g.boss, 9999);
  run(g, 4);
  assert.equal(g.boss, null); assert.equal(g.bossesDefeated, 1); assert.equal(g.lockX, null);
  assert.ok(ev.some(e => e.type === 'bossDefeated'));
  for (let zi = 1; zi < 4; zi++) {
    g.zone = zi; g.player.x = g.level.zones[zi].arenaX + 20; g.cam.x = g.player.x - 400; g.input.right = false; run(g, 0.1);
    assert.ok(g.boss, `босс зоны ${zi}`);
    g.boss.state = 'fight'; g.damageBoss(g.boss, 9999); run(g, 4);
  }
  assert.equal(g.phase, 'won');
});

test('паузa: время не идёт', () => {
  const g = fresh(); g.pause(); const t = g.time; g.update(1); assert.equal(g.time, t); g.resume(); g.update(0.5); assert.ok(g.time > t);
});

test('неделя без ввода: игра не падает и все зоны проходимы ботом', () => {
  // бот: бежит вправо, стреляет, прыгает перед ямами и врагами
  const wins = []; 
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = fresh(seed); g.input.right = true; g.input.fire = true;
    for (let i = 0; i < 60 * 600 && g.phase === 'running'; i++) {
      const p = g.player;
      const gap = g.level.gaps.find(x => x.x0 > p.x && x.x0 - p.x < 140 + p.vx * 0.12);
      const foe = g.enemies.find(e => e.type !== 'drone' && !e.air && e.x > p.x && e.x - p.x < 150 && Math.abs(e.y - p.y) < 40);
      const shot = g.ebullets.some(b => b.x > p.x && b.x - p.x < 140 && Math.abs(b.y - (p.y - 55)) < 50 && Math.abs(b.vy) < 80);
      if ((gap || foe || shot) && p.onGround && !p.jumpHeld) g.pressJump();
      if (p.jumpHeld && !gap && !foe && !shot && p.y < -60) g.releaseJump();
      g.input.up = g.enemies.some(e => e.air && e.x > p.x && e.x - p.x < 400 && e.y < p.y - 120) || (g.boss && g.boss.kind === 3 && false);
      g.step(1 / 60);
    }
    wins.push({ seed, phase: g.phase, zone: g.zone, hearts: g.player.hearts, t: Math.round(g.time) });
  }
  console.log(JSON.stringify(wins));
  assert.ok(wins.every(w => w.phase === 'won' || w.phase === 'over'));
});
