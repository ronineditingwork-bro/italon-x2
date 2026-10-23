// X2 Outdoor Lab: геометрия, правила сочетаний, каталог X2, состояние ссылки, маски. Чистая логика без браузера.
import test from 'node:test';
import assert from 'node:assert/strict';
import { products } from '../site/data.mjs';
import { apply, inv3, mul3, solveHomography, quadHomography, isConvexQuad, cameraHomography, scaleHomography, worldDistance, calibrateByDistance, maskArea, polygonAreaPx } from '../site/shared/outdoor/geometry.mjs';
import { optionStates, normalizeSettings, shaderParams, coverage, wasteFraction, formatMeters, ZONE_TYPES, MOUNTS, JOINTS } from '../site/shared/outdoor/options.mjs';
import { buildMaterials, findByCode, variantOf, packsFor, colorOf, applyTextures, textureOf } from '../site/shared/outdoor/materials.mjs';
import { encode, decode } from '../site/shared/outdoor/state.mjs';
import { fillRings, feather, referenceColor, refineByColor, buildZoneMasks } from '../site/shared/outdoor/mask.mjs';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('гомография: четыре точки переходят в углы прямоугольника, обратная обратима', () => {
  const pts = [[100, 120], [500, 100], [620, 400], [40, 430]];
  const H = quadHomography(pts, 4, 6);
  [[0, 0], [4, 0], [4, 6], [0, 6]].forEach((w, i) => { const p = apply(H, ...pts[i]); near(p.x, w[0], 1e-6); near(p.y, w[1], 1e-6); });
  const I = mul3(H, inv3(H)); near(I[0], 1); near(I[4], 1); near(I[8], 1); near(I[1], 0, 1e-9);
  assert.equal(quadHomography([[0, 0], [1, 1], [2, 2], [3, 3]], 1, 1), null, 'вырожденный четырёхугольник отклоняется');
  assert.equal(quadHomography(pts, 0, 6), null); assert.equal(quadHomography(pts, 4, -1), null);
  assert.ok(isConvexQuad(pts)); assert.ok(!isConvexQuad([[0, 0], [10, 0], [2, 1], [0, 10]]), 'невыпуклый — нельзя');
  assert.ok(solveHomography([[0, 0], [1, 1], [2, 2], [3, 3]], [[0, 0], [1, 0], [1, 1], [0, 1]]) === null);
});
test('камера: точка земли в 5 м прямо по курсу видна там, где ожидается; масштаб пропорционален высоте камеры', () => {
  const W = 1000, Hh = 700, fov = 60, f = (W / 2) / Math.tan(fov * Math.PI / 360);
  const H = cameraHomography({ width: W, height: Hh, horizon: Hh / 2, fovDeg: fov, heightM: 1.6 });
  const v = Hh / 2 + f * 1.6 / 5, p = apply(H, W / 2, v);
  near(p.x, 0, 1e-6); near(p.y, 5, 1e-6); assert.ok(p.w > 0);
  assert.ok(apply(H, W / 2, Hh / 2 - 10).w < 0, 'выше горизонта знаменатель меняет знак');
  const H2 = cameraHomography({ width: W, height: Hh, horizon: Hh / 2, fovDeg: fov, heightM: 3.2 }), q = apply(H2, W / 2, v);
  near(q.y, 10, 1e-6);
  // поворот камеры (yaw) не меняет расстояний вдоль луча, а точка по центру кадра уходит вбок
  const Hy = cameraHomography({ width: W, height: Hh, horizon: Hh / 2, fovDeg: fov, heightM: 1.6, yawDeg: 30 }), r = apply(Hy, W / 2, v);
  near(Math.hypot(r.x, r.y), 5, 1e-6); assert.ok(r.x > 1);
});
test('масштаб по известному размеру и расстояние между точками', () => {
  const H = cameraHomography({ width: 1000, height: 700, horizon: 250, fovDeg: 62, heightM: 1.6 });
  const a = [200, 500], b = [700, 520], d = worldDistance(H, a, b); assert.ok(d > 1);
  const H2 = calibrateByDistance(H, a, b, 3); near(worldDistance(H2, a, b), 3, 1e-6);
  assert.equal(calibrateByDistance(H, a, a, 3), null); assert.equal(calibrateByDistance(H, a, b, 0), null);
  assert.ok(Number.isNaN(worldDistance(H, [200, 100], [700, 520])), 'точки по разные стороны горизонта не измеряются');
  near(worldDistance(scaleHomography(H, 2), a, b), d * 2, 1e-9);
});
test('площадь маски по гомографии: прямоугольник 4 × 6 м даёт 24 м²', () => {
  const pts = [[200, 150], [700, 150], [900, 600], [60, 600]], H = quadHomography(pts, 4, 6), W = 1000, Hh = 700;
  const mask = fillRings(W, Hh, [pts]);
  const r = maskArea(H, mask, W, Hh, { step: 1 });
  assert.ok(Math.abs(r.area - 24) < 0.35, `площадь ${r.area}`); assert.ok(r.reliable);
  assert.ok(Math.abs(polygonAreaPx(pts) - mask.reduce((s, v) => s + v, 0) / 255) < 800);
  // вырез уменьшает площадь пропорционально
  const hole = [[400, 300], [600, 300], [600, 450], [400, 450]], m2 = fillRings(W, Hh, [pts, hole]), r2 = maskArea(H, m2, W, Hh, { step: 1 });
  assert.ok(r2.area < r.area - 1);
  // у горизонта площадь не уходит в бесконечность
  const Hc = cameraHomography({ width: W, height: Hh, horizon: 300, fovDeg: 62 }), sky = fillRings(W, Hh, [[[0, 296], [1000, 296], [1000, 340], [0, 340]]]);
  assert.ok(maskArea(Hc, sky, W, Hh, { step: 1 }).far > 0);
});

test('сложные случаи: сильная перспектива, вытянутый контур, горизонт в кадре, вырожденные размеры', () => {
  // очень вытянутый участок (30 × 0,5 м) и сильная перспектива: гомография конечна, масштаб по обеим осям разумен
  const far = [[380, 300], [420, 300], [900, 690], [100, 690]], H = quadHomography(far, 0.5, 30);
  assert.ok(H && H.every(Number.isFinite)); const a = apply(H, 400, 300), b = apply(H, 400, 690); assert.ok(Math.abs(a.x - 0.25) < 0.5 && Math.abs(b.y - 15) < 20);
  assert.ok(isConvexQuad(far)); assert.ok(!isConvexQuad([[0, 0], [100, 0], [0, 100], [100, 100]]), 'бабочка не годится');
  assert.equal(quadHomography([[0, 0], [100, 0], [200, 0], [300, 0]], 3, 3), null, 'все точки на одной прямой');
  // камера смотрит вниз почти отвесно и вверх: числа остаются конечными, площадь за горизонтом не считается
  for (const horizon of [-500, 0, 350, 2000]) { const Hc = cameraHomography({ width: 800, height: 600, horizon, fovDeg: 75, heightM: 3 }); assert.ok(Hc.every(Number.isFinite), `горизонт ${horizon}`); }
  const Hc = cameraHomography({ width: 800, height: 600, horizon: 5000 }); const all = new Uint8Array(800 * 600).fill(255); assert.equal(maskArea(Hc, all, 800, 600, { step: 4, sign: 1 }).reliable, false, 'весь кадр выше горизонта — площади нет');
  assert.equal(calibrateByDistance(cameraHomography({ width: 800, height: 600, horizon: 200 }), [100, 500], [700, 500], -3), null);
});
test('правила сочетаний: монтаж зависит от зоны, шов — от монтажа, пошаговая — только дорожка/патио на траве и гравии', () => {
  const mat = { formats: ['60X120', '60X60'] };
  const st = (zoneType, s) => optionStates({ zoneType, material: mat, settings: { format: '60X120', mount: 'adhesive', joint: 'narrow', layout: 'straight', direction: 'along', ...s } });
  assert.ok(!st('pool', {}).mounts.find(m => m.id === 'grass').enabled, 'у бассейна нет укладки на траву');
  assert.ok(st('path', {}).mounts.find(m => m.id === 'grass').enabled);
  assert.ok(!st('terrace', { mount: 'adhesive' }).joints.find(j => j.id === 'grass').enabled);
  assert.ok(st('path', { mount: 'grass', joint: 'grass' }).joints.find(j => j.id === 'grass').enabled);
  assert.ok(!st('path', { mount: 'grass', joint: 'grass' }).joints.find(j => j.id === 'narrow').enabled);
  assert.ok(!st('terrace', { mount: 'gravel' }).layouts.find(l => l.id === 'stepping').enabled);
  assert.ok(st('path', { mount: 'gravel', joint: 'gravel' }).layouts.find(l => l.id === 'stepping').enabled);
  assert.ok(!st('path', { mount: 'adhesive' }).layouts.find(l => l.id === 'stepping').enabled);
  assert.ok(!optionStates({ zoneType: 'path', material: mat, settings: { format: '60X60', mount: 'grass' } }).directions.find(d => d.id === 'across').enabled, 'квадрат: «поперёк» бессмысленно');
  assert.ok(MOUNTS.every(m => m.joints.every(j => JOINTS.some(x => x.id === j))));
  for (const [id, z] of Object.entries(ZONE_TYPES)) assert.ok(z.mounts.length && z.label, id);
});
test('normalizeSettings приводит любое сочетание к допустимому и объясняет, что изменилось', () => {
  const mat = { formats: ['60X120', '60X60'] };
  let r = normalizeSettings({ format: '80X80', mount: 'grass', joint: 'narrow', layout: 'stepping', direction: 'across' }, { zoneType: 'pool', material: mat });
  assert.equal(r.settings.format, '60X120', 'несуществующий формат заменяется форматом из каталога'); assert.equal(r.settings.mount, 'adhesive');
  assert.notEqual(r.settings.layout, 'stepping'); assert.ok(r.notes.length);
  r = normalizeSettings({ format: '60X60', mount: 'grass', joint: 'narrow', layout: 'stepping', direction: 'across' }, { zoneType: 'path', material: mat });
  assert.equal(r.settings.joint, 'grass'); assert.equal(r.settings.layout, 'stepping'); assert.equal(r.settings.direction, 'along');
  r = normalizeSettings({ format: '60X120', mount: 'pedestals', joint: 'gravel', layout: 'bogus', direction: 'sideways' }, { zoneType: 'terrace', material: mat });
  assert.equal(r.settings.joint, 'narrow'); assert.equal(r.settings.layout, 'offset'); assert.equal(r.settings.direction, 'along');
});
test('параметры шейдера: размеры плит в метрах, швы, «пошаговая»', () => {
  assert.deepEqual(formatMeters('60X120'), [0.6, 1.2]); assert.equal(formatMeters('ПАВЛИНИЙ ХВОСТ 97X51'), null);
  const p = shaderParams({ format: '60X120', direction: 'along', layout: 'offset', joint: 'medium', mount: 'adhesive' });
  assert.equal(p.tileX, 1.2); assert.equal(p.tileZ, 0.6); assert.equal(p.offset, 0.5); assert.equal(p.jointKind, 0); near(p.joint, 0.0065);
  assert.equal(shaderParams({ format: '60X120', direction: 'across', layout: 'straight', joint: 'narrow', mount: 'pedestals' }).jointKind, 3);
  const s = shaderParams({ format: '60X60', direction: 'along', layout: 'stepping', joint: 'grass', mount: 'grass' });
  assert.equal(s.jointKind, 1); near(s.joint, 0.3); assert.ok(coverage({ format: '60X60', layout: 'stepping', joint: 'grass', mount: 'grass', direction: 'along' }) < 0.5);
  assert.equal(wasteFraction({ layout: 'straight', direction: 'diagonal' }), 0.15);
});

test('каталог для улицы: только плиты X2 с фото и реальными форматами, один цвет — один материал', () => {
  const list = buildMaterials(products);
  assert.ok(list.length >= 40, `материалов: ${list.length}`);
  const allowed = new Set(['60X120', '60X60', '30X120']);
  for (const m of list) {
    assert.ok(m.name && m.formats.length, m.key);
    for (const f of m.formats) { assert.ok(allowed.has(f), `формат ${f} у ${m.name}`); const v = m.variants[f]; assert.ok(v.code && v.image && v.areaPerPack > 0, m.name); }
  }
  assert.ok(!list.some(m => m.formats.some(f => /80X80|120X264|ПАВЛИН|БЛОКС/.test(f))));
  assert.equal(new Set(list.map(m => m.key)).size, list.length, 'ключи уникальны');
  const magma = list.find(m => m.name === 'Магма Сильвер'); assert.deepEqual(magma.formats, ['60X120', '60X60']);
  assert.notEqual(variantOf(magma, '60X120').code, variantOf(magma, '60X60').code);
  const mil = list.find(m => m.name === 'Миллениум Сильвер'); assert.deepEqual(mil.formats, ['60X120', '60X60'], 'сокращение МИЛ. и полное название — один цвет');
  const hit = findByCode(list, variantOf(magma, '60X60').code); assert.equal(hit.format, '60X60'); assert.equal(findByCode(list, '000'), null);
  assert.equal(colorOf({ collection: 'МИЛЛЕНИУМ X2', name: 'МИЛ.СИЛЬВЕР 60X120 РЕТ Х2' }), 'Сильвер');
  assert.ok(products.filter(p => p.section === 'x2').every(p => !p.image || p.image.width > 0));
});
test('оригиналы текстур подставляются вместо фото каталога, телефону — уменьшенная копия', () => {
  const list = buildMaterials(products), m = list.find(x => x.name === 'Магма Сильвер'), code = m.variants['60X120'].code;
  const man = { v: 1, items: { [code]: { src: 'media/lab/a.webp', width: 1024, height: 2048, mobile: { src: 'media/lab/a-m.webp', width: 512, height: 1024 } }, '1': { src: 'x', width: 1, height: 1 } } };
  const d = applyTextures(list, man, { root: '../' }).find(x => x.name === 'Магма Сильвер'), t = applyTextures(list, man, { mobile: true }).find(x => x.name === 'Магма Сильвер');
  assert.equal(textureOf(d.variants['60X120']).src, '../media/lab/a.webp'); assert.equal(textureOf(t.variants['60X120']).src, './media/lab/a-m.webp');
  assert.equal(textureOf(d.variants['60X60']).original, false, 'у другого формата оригинала нет — остаётся фото каталога');
  assert.equal(applyTextures(list, { items: {} }), list); assert.equal(applyTextures(list, null), list);
  assert.equal(m.variants['60X120'].texture, undefined, 'исходные данные не меняются');
});
test('упаковки: считаем только при измеренной площади, запас и минимум заказа учтены', () => {
  const v = { areaPerPack: 0.72, minPacks: 1, unit: 'м²', priceKopecks: 669800 };
  assert.equal(packsFor(0, v), null); assert.equal(packsFor(NaN, v), null); assert.equal(packsFor(10, { areaPerPack: 0 }), null);
  const r = packsFor(10, v, { waste: 0.1 }); assert.equal(r.packs, 16); near(r.covered, 11.52, 1e-9); assert.equal(r.costKopecks, Math.round(11.52 * 669800));
  assert.equal(packsFor(0.1, v).packs, 1);
  assert.equal(packsFor(10, v, { waste: 0.1, coverage: 0.5 }).packs, 8);
});

test('ссылка на композицию: круговой обмен, мусор и чужие значения отбрасываются', () => {
  const scenes = [{ id: 'modern-pool', zones: [{ id: 'terrace' }, { id: 'pool' }] }];
  const state = { scene: 'modern-pool', zone: 'pool', zones: { terrace: { code: '610010004089', mount: 'adhesive', layout: 'offset', direction: 'along', joint: 'narrow' }, pool: { code: '610010004087', mount: 'pedestals', layout: 'straight', direction: 'diagonal', joint: 'wide' } } };
  const d = decode(encode(state), { scenes, hasCode: c => /^61/.test(c) });
  assert.deepEqual(d, state);
  const bad = decode('s=nope&z=terrace&t.terrace=abc.grass.x.y.z', { scenes }); assert.deepEqual(bad, { zones: {} });
  const evil = decode('s=modern-pool&z=<script>&t.terrace=610010004089.<img>.offset.along.narrow&t.ghost=610010004089.grass.offset.along.narrow', { scenes });
  assert.equal(evil.zone, undefined); assert.equal(evil.zones.terrace.mount, undefined); assert.equal(evil.zones.ghost, undefined);
  assert.deepEqual(decode('s=modern-pool&t.terrace=610010004089.grass.offset.along.narrow', { scenes, hasCode: () => false }).zones, {}, 'неизвестный артикул не принимается');
});

test('маски: заливка многоугольника с вырезом и мягким краем', () => {
  const w = 60, h = 40, sq = [[10, 10], [50, 10], [50, 30], [10, 30]], hole = [[20, 15], [30, 15], [30, 25], [20, 25]];
  const m = fillRings(w, h, [sq, hole]); const sum = a => a.reduce((s, v) => s + v / 255, 0);
  near(sum(m), 40 * 20 - 100, 1.5); assert.equal(m[20 * w + 25], 0); assert.equal(m[12 * w + 12], 255);
  const half = fillRings(w, h, [[[10.5, 10], [20.5, 10], [20.5, 20], [10.5, 20]]]); assert.ok(half[12 * w + 10] > 100 && half[12 * w + 10] < 150, 'край покрывается наполовину');
  assert.equal(fillRings(w, h, [[[1, 1]]]).reduce((s, v) => s + v, 0), 0);
  assert.ok(fillRings(w, h, [[[-50, -50], [200, -50], [200, 200], [-50, 200]]]).every(v => v === 255), 'контур за кадром обрезается без ошибок');
  const f = feather(m, w, h, 1); near(sum(f), sum(m), 3);
});
test('маски: уточнение по цвету убирает траву и сохраняет тени на камне', () => {
  const w = 40, h = 40, rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    let c = [150, 148, 144];                                // серый бетон
    if (x >= 28) c = [60, 130, 50];                         // трава справа
    else if (y >= 30) c = [90, 89, 86];                     // тень на бетоне
    rgba.set([...c, 255], i);
  }
  const ring = [[0, 0], [40, 0], [40, 40], [0, 40]], m = fillRings(w, h, [ring]), ref = referenceColor(rgba, m, w, h);
  assert.ok(Math.abs(ref[0] - ref[1]) < 0.08 && ref[0] > 0.3);
  const r = refineByColor(m, rgba, w, h, ref);
  assert.equal(r[10 * w + 35], 0, 'трава исключена'); assert.ok(r[10 * w + 10] > 250, 'бетон остался'); assert.ok(r[35 * w + 10] > 200, 'тень на бетоне осталась');
  const out = buildZoneMasks(rgba, w, h, [{ rings: [ring] }], { exclusion: (() => { const e = new Uint8Array(w * h); for (let y = 3; y < 9; y++) for (let x = 3; x < 9; x++) e[y * w + x] = 255; return e; })() });
  assert.equal(out.data[(5 * w + 5) * 4], 0, 'ручное исключение вырезает область'); assert.ok(out.data[(3 * w + 3) * 4] < 200, 'край исключения мягкий'); assert.ok(out.data[(10 * w + 10) * 4] > 240); assert.ok(out.refs[0] && out.pixels[0] > 700);
});
