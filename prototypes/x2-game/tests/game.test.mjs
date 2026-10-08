import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { CONFIG, DERIVED } from '../src/config.js';
import { buildTrack } from '../src/track.js';

const run = (g, seconds, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) g.step(dt); };
const clean = () => { const g = new Game(); g.start(); g.track.obstacles.length = 0; g.track.pickups.length = 0; return g; };

test('маршрут детерминирован и в каждой группе препятствий есть свободная полоса', () => {
  const a = buildTrack(7), b = buildTrack(7), c = buildTrack(8);
  assert.deepEqual(a.obstacles.map(o => o.z), b.obstacles.map(o => o.z));
  assert.notDeepEqual(a.obstacles.map(o => o.z), c.obstacles.map(o => o.z));
  for (const o of a.obstacles) assert.ok(a.obstacles.filter(p => Math.abs(p.z - o.z) < 0.01).length < CONFIG.grid.lanes);
  assert.equal(a.patches.length, CONFIG.zones.length * CONFIG.brands.patchesPerZone);
  assert.ok(a.pickups.length >= 6);
});

test('игра не двигается до старта и в паузе', () => {
  const g = new Game();
  g.step(0.05); assert.equal(g.z, 0); assert.equal(g.phase, 'menu');
  g.start(); run(g, 1); const z = g.z; assert.ok(z < -5);
  g.pause(); run(g, 2); assert.equal(g.z, z);
  g.resume(); run(g, 0.5); assert.ok(g.z < z);
});

test('одна полоса: плитки считаются один раз, шаг 0,36 м², по две в ряду', () => {
  const g = clean();
  run(g, 10);
  assert.equal(g.tilesLaid % 2, 0);
  assert.ok(g.tilesLaid >= 2 * 45);
  assert.ok(Math.abs(g.area - g.tilesLaid * 0.36) < 1e-9);
  const before = g.area;
  // повторной укладки не бывает: ряды идут только вперёд, laid не обнуляется
  g.layRow(3); assert.equal(g.area, before);
});

test('смена полосы: робот укладывает плитки в той полосе, где бежит', () => {
  const g = clean();
  g.moveLane(-1); run(g, 3);
  const left = [...g.laid].reduce((s, v, i) => s + (v && (i % 6) < 2 ? 1 : 0), 0);
  assert.ok(left > 10);
  const right = [...g.laid].reduce((s, v, i) => s + (v && (i % 6) > 3 ? 1 : 0), 0);
  assert.equal(right, 0);
  assert.equal(g.lane, 0);
});

test('широкая укладка после сбора коробки: шесть плиток в ряду четыре секунды', () => {
  const g = new Game(); g.start(); g.track.obstacles.length = 0;
  const p = g.track.pickups[0];
  g.track.pickups.length = 0; g.track.pickups.push({ ...p, lane: 1, x: DERIVED.laneX[1], z: -10, taken: false });
  run(g, 1.8);
  assert.equal(g.pickupsTaken, 1);
  assert.ok(g.isWide);
  const w = g.wide; assert.ok(w > 3 && w <= CONFIG.run.wideDuration);
  run(g, 4.1); assert.ok(!g.isWide);
  const rows = new Map();
  for (let i = 0; i < g.laid.length; i++) if (g.laid[i]) rows.set((i / 6) | 0, (rows.get((i / 6) | 0) || 0) + 1);
  assert.ok([...rows.values()].filter(n => n === 6).length >= 15);
});

test('столкновение: минус попытка, защита от повторного урона, три удара завершают забег', () => {
  const g = new Game(); g.start();
  g.track.pickups.length = 0;
  g.track.obstacles.length = 0;
  g.track.obstacles.push(
    { id: 0, type: 'planter', lane: 1, x: DERIVED.laneX[1], z: -10, h: 1.9, jumpable: false, w: 1.5, hit: false },
    { id: 1, type: 'planter', lane: 1, x: DERIVED.laneX[1], z: -10.7, h: 1.9, jumpable: false, w: 1.5, hit: false },
    { id: 2, type: 'planter', lane: 1, x: DERIVED.laneX[1], z: -25, h: 1.9, jumpable: false, w: 1.5, hit: false },
    { id: 3, type: 'planter', lane: 1, x: DERIVED.laneX[1], z: -40, h: 1.9, jumpable: false, w: 1.5, hit: false },
  );
  run(g, 2.0);
  assert.equal(g.lives, 2, 'два препятствия подряд за время защиты отнимают одну попытку');
  assert.ok(g.invuln > 0);
  run(g, 3.5); assert.equal(g.lives, 1);
  run(g, 3.5); assert.equal(g.phase, 'ended'); assert.equal(g.endReason, 'lives'); assert.equal(g.lives, 0);
});

test('прыжок: низкое препятствие можно перепрыгнуть, высокое нельзя', () => {
  const mk = (type) => { const g = new Game(); g.start(); g.track.pickups.length = 0; g.track.obstacles.length = 0;
    g.track.obstacles.push({ id: 0, type, lane: 1, x: DERIVED.laneX[1], z: -9, ...CONFIG.obstacles.types[type], hit: false }); return g; };
  const low = mk('cone');
  run(low, 1.1); // 1,1 с × 6 = 6,6 ед.: до конуса (z = −9) остаётся около 1,8 ед.
  low.jump(); run(low, 1.5);
  assert.equal(low.lives, 3, 'конус перепрыгнули');
  const high = mk('planter');
  run(high, 1.1); high.jump(); run(high, 1.5);
  assert.equal(high.lives, 2, 'вазон перепрыгнуть нельзя');
});

test('забег заканчивается по времени; зоны идут по 15 секунд; пройдено четыре зоны', () => {
  const g = clean(); const zones = [];
  g.on(e => { if (e.type === 'zone') zones.push(e.zone); });
  run(g, 61);
  assert.equal(g.phase, 'ended'); assert.equal(g.endReason, 'time');
  assert.deepEqual(zones, [1, 2, 3]);
  assert.equal(g.summary().zonesCompleted, 4);
  assert.ok(g.summary().area > 100);
});

test('перезапуск полностью сбрасывает мир и счёт', () => {
  const g = new Game(); g.start(); run(g, 20);
  assert.ok(g.area > 0 || g.hits > 0);
  g.start();
  assert.equal(g.area, 0); assert.equal(g.time, 0); assert.equal(g.z, 0); assert.equal(g.lives, 3);
  assert.equal(g.laid.reduce((s, v) => s + v, 0), 0);
  assert.ok(g.track.obstacles.every(o => !o.hit) && g.track.pickups.every(p => !p.taken));
});
