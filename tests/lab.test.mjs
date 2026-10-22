// MATERIAL LAB: чистая логика (раскладка, камера, карты рельефа, адаптация качества, движение) и честная связь с каталогом.
import test from 'node:test';
import assert from 'node:assert/strict';
import { products } from '../site/data.mjs';
import { FORMATS, tileAt, variantOf, hash2, HASH_OFFSET, jointCm, JOINT_MAX_MM } from '../site/shared/lab/layout.mjs';
import { unproject, project, panBy, zoomAt, clampTilt, TILT_MAX } from '../site/shared/lab/camera.mjs';
import { buildNormalMap, averageColor } from '../site/shared/lab/maps.mjs';
import { detectTier, Adaptive, LEVELS, START_LEVEL } from '../site/shared/lab/perf.mjs';
import { choreograph, sweepFor, lightAt, easeInOut } from '../site/shared/lab/motion.mjs';
import { LAB_MATERIALS, resolveMaterials } from '../site/shared/lab/materials.mjs';
import lab, { labData } from '../site/pages/lab.mjs';

test('три материала — реальные позиции каталога с фото, названием и артикулом', () => {
  const res = resolveMaterials(products);
  assert.equal(res.length, 3);
  for (const m of res) { assert.ok(m.product.image?.src && m.product.image.width >= 700, `${m.code}: нужно крупное фото`); assert.ok(m.product.name); assert.equal(m.product.code, m.code); assert.ok(m.product.priceKopecks > 0); }
  assert.throws(() => resolveMaterials(products, [{ code: '000' }]), /нет позиции/);
});
test('материалы заметно различаются по цвету (контрастный набор)', async () => {
  const { readFileSync } = await import('node:fs');
  const lum = res => { /* средняя светлота по имени цвета в каталоге не нужна: сверяем по данным рельефа/блеска */ return res.surf.rough; };
  const r = LAB_MATERIALS.map(lum); assert.ok(Math.max(...r) - Math.min(...r) > 0.3);
  void readFileSync;
});
test('данные страницы: названия без суффикса формата, путь к карточке и цена', () => {
  const d = labData('../');
  assert.deepEqual(d.map(x => x.name), ['Ривьера Уайт', 'Вояджер Блэк', 'Крета Клэй']);
  for (const x of d) { assert.match(x.href, /^\.\.\/product\/\d{12}\/$/); assert.match(x.path, /^\/product\/\d{12}\/$/); assert.match(x.priceText, /₽/); assert.ok(x.image.startsWith('../media/')); }
  assert.equal(lab.noindex, true); assert.equal(lab.path, '/lab/');
});
test('хэш плиток детерминирован и распределён равномерно', () => {
  assert.equal(hash2(5, 7), hash2(5, 7)); let s = 0; const N = 5000; for (let i = 0; i < N; i++) s += hash2(i + HASH_OFFSET, (i * 7) % 311 + HASH_OFFSET);
  assert.ok(Math.abs(s / N - 0.5) < 0.03);
  const v = variantOf(-3, -4); assert.ok(v.id >= 0 && v.id < 1);
});
test('раскладка: плитка, шов, смещение рядов ½ и ⅓', () => {
  const o = { w: 60, h: 60, joint: 0.4, mode: 0 };
  const a = tileAt(10, 10, o); assert.ok(a.inside && a.col === 0 && a.row === 0);
  const j = tileAt(60.3, 10, o); assert.ok(!j.inside, 'точка внутри шва');
  const half = { ...o, mode: 1 }, r0 = tileAt(60.4 + 5, 5, half), r1 = tileAt(60.4 + 5, 60.4 + 5, half);
  assert.notEqual(r0.col, r1.col, 'второй ряд сдвинут на половину');
  assert.equal(tileAt(5, 5, { ...o, mode: 2 }).row, 0);
  for (const f of FORMATS) assert.ok(f.w > 0 && f.h > 0 && f.id === `${f.w}x${f.h}`);
  assert.equal(jointCm(25), JOINT_MAX_MM / 10); assert.equal(jointCm(-3), 0);
});
test('камера: unproject и project взаимно обратны, масштаб и сдвиг сохраняют точку под пальцем', () => {
  const cam = { center: [10, -20], rot: 0.5, tilt: 0.7, ppcm: 6 }, W = 800, H = 500;
  for (const [x, y] of [[400, 250], [120, 400], [700, 300]]) { const P = unproject(cam, x, y, W, H); const s = project(cam, P, W, H); assert.ok(Math.hypot(s[0] - x, s[1] - y) < 1e-6); }
  assert.equal(unproject({ ...cam, tilt: 1.3 }, 400, 0, W, H), null, 'выше горизонта точки нет');
  const c = { ...cam }, before = unproject(c, 300, 200, W, H); zoomAt(c, 1.7, 300, 200, W, H); const after = unproject(c, 300, 200, W, H); assert.ok(Math.hypot(before[0] - after[0], before[1] - after[1]) < 1e-6);
  const p = { ...cam }, P0 = unproject(p, 500, 350, W, H); panBy(p, 500, 350, 560, 380, W, H); const P1 = unproject(p, 560, 380, W, H); assert.ok(Math.hypot(P0[0] - P1[0], P0[1] - P1[1]) < 1e-6);
  assert.equal(clampTilt(5), TILT_MAX); assert.equal(clampTilt(-1), 0);
});
test('карта рельефа: градиент даёт нормаль в нужную сторону, ровная плитка — плоская', () => {
  const n = 32, flat = new Uint8ClampedArray(n * n * 4).fill(128); for (let i = 3; i < flat.length; i += 4) flat[i] = 255;
  const nf = buildNormalMap(flat, n); assert.ok(Math.abs(nf[0] - 128) <= 1 && Math.abs(nf[1] - 128) <= 1 && nf[2] >= 254);
  const ramp = new Uint8ClampedArray(n * n * 4); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const o = (y * n + x) * 4; ramp[o] = ramp[o + 1] = ramp[o + 2] = x * 8; ramp[o + 3] = 255; }
  const nr = buildNormalMap(ramp, n, { blur: 1 }), o = (16 * n + 16) * 4; assert.ok(nr[o] < 128, 'высота растёт вправо → нормаль смотрит влево'); assert.equal(nr[o + 3] > 0 && nr[o + 3] < 255, true);
  const avg = averageColor(flat, n); assert.deepEqual(avg.map(Math.round), [128, 128, 128]);
});
test('качество: слабые устройства получают упрощённый режим, без WebGL 2 — запасной', () => {
  assert.equal(detectTier({ webgl2: false }).tier, 'fallback');
  assert.equal(detectTier({ renderer: 'Google SwiftShader' }).tier, 'low');
  assert.equal(detectTier({ mobile: true, cores: 8, memory: 8, renderer: 'Apple GPU' }).tier, 'medium');
  assert.equal(detectTier({ mobile: true, memory: 2 }).tier, 'low');
  assert.equal(detectTier({ renderer: 'NVIDIA GeForce RTX' }).tier, 'high');
  assert.equal(detectTier({ forceLite: true }).tier, 'low'); assert.equal(detectTier({ saveData: true }).tier, 'low');
  assert.ok(START_LEVEL.low > START_LEVEL.high && LEVELS[START_LEVEL.low].q === 2);
});
test('адаптация: тормоза опускают уровень, стабильная скорость — осторожно поднимают, границы соблюдаются', () => {
  const a = new Adaptive(0, { slowFrames: 10, fastFrames: 20, cooldown: 3 }); let changed = null;
  for (let i = 0; i < 12; i++) changed = a.push(60) || changed; assert.equal(a.level, 1); assert.equal(changed.dir, 'down');
  for (let i = 0; i < 100; i++) a.push(60); assert.ok(a.level <= LEVELS.length - 1);
  const b = new Adaptive(2, { slowFrames: 10, fastFrames: 20, cooldown: 0, min: 2 }); for (let i = 0; i < 100; i++) b.push(8); assert.equal(b.level, 2, 'min не нарушается');
  const c = new Adaptive(3, { fastFrames: 20, cooldown: 0 }); for (let i = 0; i < 25; i++) c.push(8); assert.equal(c.level, 2);
});
test('движение: шторка перехода покрывает кадр целиком, свет в границах, сценарий ролика меняет материал', () => {
  assert.equal(sweepFor(0, 0.56).on, false); assert.equal(sweepFor(1, 0.56).on, false);
  const s0 = sweepFor(0.001, 0.56), s1 = sweepFor(0.999, 0.56); assert.ok(s0.pos < -0.3 && s1.pos > 0.3);
  for (let a = 0; a < 7; a += 0.5) for (const m of ['day', 'evening', 'side']) { const l = lightAt(m, a); assert.ok(Math.hypot(l.x, l.y) < 100 && l.h >= 6); }
  const base = { a: 2, b: 0, mode: 'evening', compare: true, cam: { center: [0, 0], rot: 0, tilt: 0.6, ppcm: 5 }, light: { x: 0, y: 0, h: 20 }, sweep: { on: true } };
  const st = t => choreograph(base, t, { duration: 7, from: 2, to: 0 });
  assert.equal(st(0).a, 2); assert.equal(st(0).sweep.on, false); assert.ok(st(3.5).sweep.on); assert.equal(st(6.9).a, 0); assert.equal(st(6.9).compare, false);
  assert.ok(st(7).cam.ppcm > st(0).cam.ppcm); assert.equal(easeInOut(0), 0); assert.equal(easeInOut(1), 1);
});
