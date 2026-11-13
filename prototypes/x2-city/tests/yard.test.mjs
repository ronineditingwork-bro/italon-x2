import test from 'node:test';
import assert from 'node:assert/strict';
import { YardGame, YARD } from '../src/yard.js';

test('робот мостит клетку под собой, помощники — соседние', () => {
  const g = new YardGame(); g.start(); const n = g.laid; g.input.right = true;
  for (let i = 0; i < 120; i++) g.step(1 / 60);
  assert.ok(g.laid > n + 6); assert.equal(g.cells[g.cellAt(g.player.x, g.player.z)], 1);
});
test('брак ломает плитку и ранит; выстрел по клетке освобождает помощника', () => {
  const g = new YardGame(); g.start(); const h = g.helpers.length;
  g.openCage(g.cages[0]); assert.equal(g.helpers.length, h + 1);
  g.enemies.push({ id: 99, x: 0.3, z: 0, hp: 2, r: 0.55, speed: 0, crack: 0, flash: 0, dx: 1, dz: 0 }); const hearts = g.player.hearts;
  g.step(1 / 60); assert.equal(g.player.hearts, hearts - 1); assert.equal(g.helpers.length, h);
});
test('брак не появляется вплотную к роботу у края двора', () => {
  const g = new YardGame(); g.start(); g.player.x = g.w / 2 - 0.4; let n = 0; g.on(e => { if (e.type === 'hit') n++; }); g.input.fire = true;
  for (let i = 0; i < 60 * 25; i++) g.step(1 / 60);
  assert.equal(n, 0);
});
test('бот замощает двор до победы', () => {
  const g = new YardGame(); g.start(); g.player.hearts = 99; let row = 0, dir = 1;
  for (let i = 0; i < 60 * 600 && g.phase === 'running'; i++) { const p = g.player, inp = g.input; inp.fire = true;
    const tz = -g.h / 2 + 0.8 + row * YARD.cell * 2; inp.left = inp.right = inp.up = inp.down = false;
    if (Math.abs(p.z - tz) > 0.3) { inp.down = p.z < tz; inp.up = p.z > tz; } else { inp.right = dir > 0; inp.left = dir < 0; if ((dir > 0 && p.x > g.w / 2 - 0.6) || (dir < 0 && p.x < -g.w / 2 + 0.6)) { dir = -dir; row = (row + 1) % Math.ceil(YARD.rows / 2); } }
    g.step(1 / 60); }
  assert.equal(g.phase, 'won'); console.log('время', g.time.toFixed(0), 'с; бригада', g.helpers.length, '/', g.total, '; м²', g.area.toFixed(0), '; врагов', g.kills);
});
