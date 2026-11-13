import test from 'node:test';
import assert from 'node:assert/strict';
import { BossGame, BOSS } from '../src/boss.js';

test('босс выходит сразу, бригада наносит урон, победа завершает уровень', () => {
  const g = new BossGame(); g.start(); g.player.hearts = 99; g.input.right = true;
  for (let i = 0; i < 60 * 4; i++) g.step(1 / 60);
  assert.ok(g.boss, 'босс на арене'); assert.equal(g.boss.kind, BOSS.kind); g.input.right = false; g.input.fire = true;
  const hp = g.boss.hp; for (let i = 0; i < 60 * 6; i++) g.step(1 / 60); assert.ok(g.boss.hp < hp);
  for (let i = 0; i < 60 * 240 && g.phase === 'running'; i++) { if (i % 50 === 0 && g.player.onGround) g.pressJump(); g.step(1 / 60); }
  assert.equal(g.phase, 'won'); console.log('время боя', g.time.toFixed(0), 'с; бригада', g.helpers, '/', g.total);
});
test('попадание по роботу стоит помощника', () => {
  const g = new BossGame(); g.start(); g.hurtPlayer(0); assert.equal(g.helpers, BOSS.helpers - 1);
});
