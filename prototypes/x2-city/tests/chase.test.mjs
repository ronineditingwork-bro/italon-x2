import test from 'node:test';
import assert from 'node:assert/strict';
import { ChaseGame, CHASE } from '../src/chase.js';

test('в каждом ряду есть проход: свободная полоса, барьер или «брак»', () => {
  const g = new ChaseGame(), rows = new Map(); for (const o of g.objs) rows.set(o.z, [...(rows.get(o.z) || []), o.kind]);
  for (const [z, k] of rows) assert.ok(k.filter(x => x === 'boulder').length < 3, 'ряд ' + z);
  assert.ok(g.total > CHASE.helpers);
});
test('столкновение с обломком: минус сердце и помощник; барьер перепрыгивается', () => {
  const g = new ChaseGame(); g.start(); g.objs = [{ kind: 'boulder', lane: 1, x: 0, z: 5, hp: 1, done: false, flash: 0 }, { kind: 'barrier', lane: 1, x: 0, z: 60, hp: 1, done: false, flash: 0 }];
  for (let i = 0; i < 40; i++) g.step(1 / 60); assert.equal(g.player.hearts, CHASE.hearts - 1); assert.equal(g.helpers, CHASE.helpers - 1);
  while (g.d < 55) g.step(1 / 60); g.pressJump(); const h = g.player.hearts; while (g.d < 66) g.step(1 / 60); assert.equal(g.player.hearts, h);
});
test('бот догоняет экскаватор', () => {
  const g = new ChaseGame(); g.start(); const safe = k => !k || k === 'cage' || k === 'heart';
  for (let i = 0; i < 60 * 300 && g.phase === 'running'; i++) { const p = g.player, inp = g.input; inp.fire = true; inp.left = inp.right = false;
    const next = g.objs.filter(o => !o.done && o.z > g.d + 0.5 && o.z < g.d + 14), z = next[0]?.z, row = [0, 1, 2].map(l => next.find(o => o.z === z && o.lane === l)?.kind);
    if (z) { const want = [p.lane, 1, 0, 2].find(l => safe(row[l])) ?? [p.lane, 1, 0, 2].find(l => row[l] === 'brak') ?? [0, 1, 2].find(l => row[l] === 'barrier');
      if (i % 6 === 0) { inp.left = want < p.lane; inp.right = want > p.lane; } if (row[p.lane] === 'barrier' && z - g.d < 4.5) g.pressJump(); }
    g.step(1 / 60); }
  assert.equal(g.phase, 'won'); console.log('время', g.time.toFixed(0), 'с; бригада', g.helpers, '/', g.total, '; сердца', g.player.hearts, '; м²', g.area.toFixed(0));
});
