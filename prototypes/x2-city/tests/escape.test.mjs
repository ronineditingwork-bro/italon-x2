import test from 'node:test';
import assert from 'node:assert/strict';
import { EscapeGame, ESCAPE } from '../src/escape.js';

const run = (g, sec, fn) => { for (let i = 0; i < sec * 60 && g.phase === 'running'; i++) { fn?.(g, i); g.step(1 / 60); } };

test('клетки стоят на земле, выстрел освобождает помощника', () => {
  const g = new EscapeGame(); g.start();
  assert.ok(g.total >= 8);
  for (const c of g.cages) assert.ok(g.cageSpot(c.x));
  const c = g.cages[0]; g.player.x = c.x - 200; g.chaser.x = g.player.x - 600; g.input.fire = true;
  run(g, 1); assert.equal(c.open, true); assert.equal(g.helpers, 1);
});

test('укладчик догоняет стоящего робота: минус сердце и помощник', () => {
  const g = new EscapeGame(); g.start(); g.helpers = 2; const h = g.player.hearts;
  run(g, 8);
  assert.ok(g.player.hearts < h); assert.ok(g.helpers < 2);
  assert.ok(g.chaser.x >= g.player.x - ESCAPE.chaseBand - 1);
});

test('бот добегает до финиша и побеждает', () => {
  const g = new EscapeGame(); g.start(); g.player.hearts = 99;
  run(g, 600, (g, i) => { g.input.right = true; g.input.fire = true; const p = g.player;
    const gap = g.level.gaps.find(q => q.x0 > p.x && q.x0 - p.x < 70), wall = g.level.ledges.find(l => l.x0 > p.x && l.x0 - p.x < 90 && p.y > -l.h + 5);
    if ((gap || wall || i % 90 === 0) && p.onGround) g.pressJump(); });
  assert.equal(g.phase, 'won'); assert.ok(g.area > 100); assert.ok(g.time < 400);
  console.log('время', g.time.toFixed(0), 'с; помощники', g.helpers, '/', g.total, '; м²', g.area.toFixed(0));
});
