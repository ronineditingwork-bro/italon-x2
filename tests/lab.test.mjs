// MATERIAL LAB: чистая логика (раскладка, камера, карты рельефа, адаптация качества, движение, каталог и поиск, сутки, ссылка на композицию)
// и честная связь с каталогом сайта: ни одного второго списка товаров.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { products } from '../site/data.mjs';
import { FORMATS, tileAt, variantOf, hash2, HASH_OFFSET, jointCm, JOINT_MAX_MM } from '../site/shared/lab/layout.mjs';
import { unproject, project, panBy, zoomAt, clampTilt, TILT_MAX } from '../site/shared/lab/camera.mjs';
import { buildNormalMap, averageColor } from '../site/shared/lab/maps.mjs';
import { detectTier, Adaptive, LEVELS, START_LEVEL } from '../site/shared/lab/perf.mjs';
import { choreograph, sweepFor, lightAt, easeInOut } from '../site/shared/lab/motion.mjs';
import { FEATURED, FEATURED_CODES, featuredEntries } from '../site/shared/lab/materials.mjs';
import { labAsset, parseFormat, cleanName, surfaceFor, toEntry, buildIndex, search, classify, filterEntries, facetsOf, sortEntries, HD_MIN_SIDE, COLOR_FAMILIES, SLAB_FORMAT, SLAB_PRIORITY, isSlab, slabList, checkOriginal, applyOriginals } from '../site/shared/lab/catalog.mjs';
import { imageSize } from '../site/shared/lab/image-size.mjs';
import { buildOriginals } from '../scripts/lab-originals.mjs';
import { lightAtWall, WALL_PRESETS } from '../site/shared/lab/motion.mjs';
import { deflateSync } from 'node:zlib';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { skyAt, formatHour, presetOf, PRESETS, WORLD } from '../site/shared/lab/timeofday.mjs';
import { encode, decode } from '../site/shared/lab/composition.mjs';
import { attributesOf } from '../site/shared/picker-text.mjs';
import { unpack, fromBase64 } from '../site/shared/picker-features.mjs';
import lab, { labData } from '../site/pages/lab.mjs';

const entryOf = p => toEntry(p, { root: '../' });
const entries = products.map(entryOf), eligible = entries.filter(e => e.eligible), index = buildIndex(products, entryOf);

test('витрина: 8 материалов — реальные позиции каталога, фото высокого разрешения, названия и артикулы из каталога', () => {
  const res = featuredEntries(products, entryOf);
  assert.equal(res.length, 8); assert.deepEqual(res.map(r => r.code), FEATURED_CODES);
  assert.deepEqual(res.map(r => r.name), ['Ривьера Уайт', 'Вояджер Блэк', 'Крета Клэй', 'Фьямма Бронз', 'Эверстоун Лава', 'Дискавер Дезерт', 'Да Винчи Браун', 'Экспо Дарк']);
  for (const m of res) { assert.equal(m.quality, 'hd'); assert.ok(m.imgW >= HD_MIN_SIDE && m.imgH >= HD_MIN_SIDE); assert.ok(m.image.startsWith('../media/products/')); assert.match(m.priceText, /₽/); assert.match(m.href, /^\.\.\/product\/\d{12}\/$/); }
  assert.throws(() => featuredEntries([], entryOf), /нет позиции/);
});
test('второго каталога нет: артикулы встречаются в коде лаборатории только в списке витрины', () => {
  const dir = resolve(import.meta.dirname, '../site/shared/lab'), bad = [];
  for (const f of readdirSync(dir).filter(x => x.endsWith('.mjs'))) { const src = readFileSync(resolve(dir, f), 'utf8'); const hits = src.match(/\b6\d{11}\b/g) || []; if (f !== 'materials.mjs' && hits.length) bad.push(f); }
  assert.deepEqual(bad, []);
});
test('данные страницы: витрина вшита, каталог не копируется', () => {
  const d = labData('../'); assert.equal(d.length, 8); assert.equal(lab.noindex, true); assert.equal(lab.path, '/lab/');
  assert.ok(JSON.stringify(d).length < 12000, 'в страницу вшита только витрина, а не весь каталог');
});
test('пригодность для лаборатории: плитки с фото — да; мозаика, декор, упаковка — нет; качество по меньшей стороне фото', () => {
  assert.equal(labAsset({ format: '60X60', category: 'plate', image: { src: 'a', width: 900, height: 900 } }).quality, 'hd');
  assert.equal(labAsset({ format: '120X278', category: 'plate', image: { src: 'a', width: 148, height: 341 } }).quality, 'lite');
  assert.equal(labAsset({ format: '60X60', category: 'plate', image: { src: 'a', width: HD_MIN_SIDE, height: HD_MIN_SIDE } }).quality, 'hd');
  assert.equal(labAsset({ format: '60X60', category: 'plate', image: { src: 'a', width: HD_MIN_SIDE - 1, height: 900 } }).quality, 'lite');
  assert.equal(labAsset({ format: 'МОЗАИКА 30X30', category: 'mosaic', image: { src: 'a', width: 900, height: 900 } }).eligible, false);
  assert.equal(labAsset({ format: '60X60', name: 'ДЕКОР', image: { src: 'a', width: 900, height: 900 } }).eligible, false);
  assert.equal(labAsset({ format: '60X60', category: 'plate' }).eligible, false);
  assert.deepEqual(parseFormat('120x278'), [120, 278]); assert.equal(parseFormat('МОЗАИКА 30X30'), null);
  assert.ok(eligible.length > 700 && eligible.length < 800, `пригодных: ${eligible.length}`);
  assert.ok(eligible.filter(e => e.quality === 'hd').length >= 50);
});
test('новые коллекции и новые фото подключаются автоматически: достаточно записи в каталоге', () => {
  const fresh = { code: '699999999999', name: 'НОВАЯ ТЕСТ УАЙТ 80 РЕТ', collection: 'НОВАЯ', collectionId: 'nova-test', format: '80X160', finish: 'ЛЮКС И РЕТТИФИЦИРОВАННАЯ', category: 'plate', unit: 'м²', priceKopecks: 100000, image: { src: 'media/products/new.webp', width: 1600, height: 1600 } };
  const e = toEntry(fresh, { root: './' }); assert.equal(e.eligible, true); assert.equal(e.quality, 'hd'); assert.deepEqual(e.photo, [80, 160]); assert.equal(e.name, 'Новая Тест Уайт'); assert.ok(e.surf.rough < 0.2, 'люкс — глянцевая');
  const small = toEntry({ ...fresh, image: { ...fresh.image, width: 300, height: 600 } }); assert.equal(small.quality, 'lite');
});
test('упрощённый режим не дорисовывает детали: у фото низкого разрешения нет рельефа и зерна; приближение ограничено', () => {
  const lite = eligible.find(e => e.quality === 'lite'), hd = eligible.find(e => e.quality === 'hd');
  assert.equal(lite.surf.relief, 0); assert.equal(lite.surf.micro, 0); assert.ok(hd.surf.relief > 0 && hd.surf.micro > 0);
  assert.ok(lite.maxPpcm < hd.maxPpcm, `приближение: ${lite.maxPpcm} < ${hd.maxPpcm}`); assert.ok(lite.maxPpcm >= 3.5);
  assert.ok(surfaceFor({ finish: 'ЛЮКС' }).rough < surfaceFor({ finish: 'НАТУРАЛЬНЫЙ' }).rough && surfaceFor({ finish: 'ГРИП' }).relief > surfaceFor({ finish: 'ЛЮКС' }).relief);
});
test('названия: размер и «РЕТ» убираются, регистр читаемый', () => {
  assert.equal(cleanName('ПРИ.ДЕНИМ РЭД 120X278 ЛЮКС'), 'При.Деним Рэд'); assert.equal(cleanName('РИВЬЕРА УАЙТ 60 РЕТ'), 'Ривьера Уайт'); assert.equal(cleanName('АУРИС ГРАФИТ ГРИП 60 РЕT'), 'Аурис Графит Грип');
});
test('поиск по всему каталогу: артикул (полный и начало), название, коллекция, формат, ё/е, регистр', () => {
  assert.equal(products.length, 1202); assert.equal(index.length, 1202);
  assert.equal(search(index, '610010003167')[0].code, '610010003167');
  assert.equal(search(index, '6100100031')[0].code.startsWith('6100100031'), true);
  assert.ok(search(index, 'ривьера').some(e => e.code === '610010003167'));
  assert.ok(search(index, 'РИВЬЕРА уайт').every(e => /ривьера/i.test(e.name)) && search(index, 'ривьера уайт')[0].code === '610010003167');
  assert.ok(search(index, 'Дискавер дезерт').some(e => e.code === '610010002735'));
  assert.ok(search(index, '60x120').length > 10 && search(index, '60х120').length === search(index, '60x120').length, 'русская «х» равна латинской');
  assert.equal(search(index, 'zzzzqq').length, 0); assert.equal(search(index, '   ').length, 0);
  assert.ok(search(index, 'мозаика', { limit: 5 }).every(e => !e.eligible), 'мозаика находится, но помечена как не входящая в лабораторию');
  const all = search(index, 'ривьера', { limit: 1000 }); assert.ok(all.some(e => e.eligible) && all.some(e => !e.eligible));
});
test('поиск быстрый: по всем 1202 товарам меньше 10 мс на запрос в среднем', () => {
  const qs = ['уайт', '6100', 'дарк 60', 'мрамор', '120x278', 'брон', 'италон', 'x2'], t0 = performance.now();
  for (let i = 0; i < 100; i++) for (const q of qs) search(index, q, { limit: 60 });
  const ms = (performance.now() - t0) / (100 * qs.length); assert.ok(ms < 10, `среднее ${ms.toFixed(2)} мс`);
});
test('фильтры: цвет и фактура считаются по признакам подбора, коллекция и формат — по каталогу', () => {
  assert.equal(classify(null).color, ''); const white = classify({ L: 92, C: 3, h: 80, looks: { marble: 0.8 } }); assert.equal(white.color, 'light'); assert.equal(white.look, 'marble');
  assert.equal(classify({ L: 12, C: 2, h: 40, looks: { stone: 0.7 } }).color, 'dark'); assert.equal(classify({ L: 40, C: 20, h: 55, looks: {} }).look, '');
  const attrs = new Map([[eligible[0].code, { color: 'dark', look: 'stone' }], [eligible[1].code, { color: 'light', look: 'marble' }]]);
  assert.equal(filterEntries(eligible, { color: 'dark' }, attrs).length, 1); assert.equal(filterEntries(eligible, { look: 'marble' }, attrs)[0].code, eligible[1].code);
  assert.ok(filterEntries(eligible, { format: '60X60' }).every(e => e.formatKey === '60X60') && filterEntries(eligible, { format: '60X60' }).length > 100);
  const f = facetsOf(entries, attrs); assert.ok(f.collections.length > 30 && f.formats.length > 5 && f.colors.length === 2 && f.looks.length === 2); assert.ok(f.formats[0].label.length);
  assert.ok(filterEntries(entries, { onlyEligible: false }).length === entries.length && filterEntries(entries).every(e => e.eligible));
  assert.ok(COLOR_FAMILIES.every(c => c.keys.length && c.swatch));
});
test('цвет и фактура реально различают плитки каталога (по настоящим признакам picker.json)', async () => {
  let pj; try { pj = JSON.parse(readFileSync(resolve(import.meta.dirname, '../public/data/picker.json'), 'utf8')); } catch { return; }   // файл появляется после сборки сайта
  const byCode = new Map(); for (const p of products) { const e = entryOf(p); const b64 = pj.items[String(p.image?.src || '').replace(/^\//, '')]; if (e.eligible && b64) byCode.set(p.code, classify(attributesOf(p, unpack(fromBase64(b64))))); }
  assert.ok(byCode.size > 600, `признаки есть у ${byCode.size}`);
  const colors = new Set([...byCode.values()].map(a => a.color)), looks = new Set([...byCode.values()].map(a => a.look));
  assert.ok(colors.size >= 5 && looks.size >= 4, `цветов ${colors.size}, фактур ${looks.size}`);
  assert.equal(byCode.get('610010003167').color, 'light'); assert.equal(byCode.get('610010002765').color, 'dark');
});
test('сортировка «Популярные»: витрина первой, затем полная симуляция', () => {
  const s = sortEntries(eligible, 'popular', FEATURED_CODES); assert.deepEqual(s.slice(0, 8).map(e => e.code), FEATURED_CODES);
  const firstLite = s.findIndex(e => e.quality === 'lite'), lastHd = s.map(e => e.quality).lastIndexOf('hd'); assert.ok(firstLite > lastHd, 'сначала все HD, потом упрощённые');
  assert.ok(sortEntries(eligible, 'name')[0].name.localeCompare(sortEntries(eligible, 'name')[5].name, 'ru') <= 0);
});
test('сутки: солнце входит в окно днём, ночью — луна и тусклая лампа; свет меняется плавно, без скачков', () => {
  const day = skyAt(13), night = skyAt(23), eve = skyAt(19.5), dawn = skyAt(8);
  assert.equal(day.key, 'sun'); assert.equal(night.key, 'moon'); assert.ok(day.sunDir[1] > 0.2 && day.sunDir[2] > 0.5, 'солнце высоко и со стороны окна');
  assert.ok(day.sunCol[0] > night.sunCol[0] * 4, 'днём ярче'); assert.ok(eve.lamp[0] > day.lamp[0] && eve.lamp[0] > night.lamp[0], 'лампа ярче всего вечером');
  assert.ok(dawn.sunCol[0] / dawn.sunCol[2] > day.sunCol[0] / day.sunCol[2], 'утром теплее');
  assert.ok(night.sunCol[2] > night.sunCol[0], 'луна холодная'); assert.ok(night.exposure >= day.exposure, 'ночью глаз привыкает');
  let maxJump = 0, prev = skyAt(0); for (let h = 0.05; h <= 24; h += 0.05) { const s = skyAt(h); maxJump = Math.max(maxJump, ...s.amb.map((v, i) => Math.abs(v - prev.amb[i])), ...s.lamp.map((v, i) => Math.abs(v - prev.lamp[i])) , ...s.sunCol.map((v, i) => Math.abs(v - prev.sunCol[i]))); prev = s; }
  assert.ok(maxJump < 0.2, `скачок света ${maxJump.toFixed(3)} за 3 минуты`);
  assert.deepEqual(skyAt(24).amb.map(v => +v.toFixed(3)), skyAt(0).amb.map(v => +v.toFixed(3)), 'сутки замкнуты');
  assert.equal(formatHour(13.5), '13:30'); assert.equal(formatHour(25), '01:00'); assert.equal(presetOf(8), 'morning'); assert.equal(presetOf(13), 'day'); assert.equal(presetOf(19.5), 'evening'); assert.equal(presetOf(2), 'night');
  assert.equal(PRESETS.length, 4); assert.ok(WORLD.winZ1 < WORLD.wallH);
});
test('ссылка на композицию: кодирование и разбор, отбраковка мусора', () => {
  const s = { code: '610010003167', second: '610010002765', compare: true, mode: 'time', hour: 19.5, format: '60x120', turned: true, jointMm: 4.5, jointColor: 'graphite', bond: 'half', cam: { rot: 0.5, tilt: 0.7, ppcm: 6 } };
  const back = decode(encode(s)); assert.deepEqual(back, { code: s.code, second: s.second, compare: true, mode: 'time', hour: 19.5, format: '60x120', turned: true, jointMm: 4.5, jointColor: 'graphite', bond: 'half', cam: s.cam });
  assert.deepEqual(decode(''), {}); assert.deepEqual(decode('#m=abc&l=9&f=1x1&j=NaN&c=zz&k=?&v=1,2'), {});
  assert.equal(decode('#m=610010003167&j=999').jointMm, JOINT_MAX_MM); assert.equal(decode('m=610010003167').mode, undefined, 'отсутствующий режим не подменяется');
  assert.equal(decode('#v=0,9,100').cam.tilt, 1.08);
});
test('хэш плиток детерминирован и распределён равномерно', () => {
  assert.equal(hash2(5, 7), hash2(5, 7)); let s = 0; const N = 5000; for (let i = 0; i < N; i++) s += hash2(i + HASH_OFFSET, (i * 7) % 311 + HASH_OFFSET);
  assert.ok(Math.abs(s / N - 0.5) < 0.03); const v = variantOf(-3, -4); assert.ok(v.id >= 0 && v.id < 1);
});
test('раскладка: плитка, шов, смещение рядов ½ и ⅓', () => {
  const o = { w: 60, h: 60, joint: 0.4, mode: 0 };
  const a = tileAt(10, 10, o); assert.ok(a.inside && a.col === 0 && a.row === 0); assert.ok(!tileAt(60.3, 10, o).inside, 'точка внутри шва');
  const half = { ...o, mode: 1 }, r0 = tileAt(60.4 + 5, 5, half), r1 = tileAt(60.4 + 5, 60.4 + 5, half); assert.notEqual(r0.col, r1.col, 'второй ряд сдвинут на половину');
  assert.equal(tileAt(5, 5, { ...o, mode: 2 }).row, 0); for (const f of FORMATS) assert.ok(f.w > 0 && f.h > 0 && f.id === `${f.w}x${f.h}`);
  assert.equal(jointCm(25), JOINT_MAX_MM / 10); assert.equal(jointCm(-3), 0);
});
test('камера: unproject и project взаимно обратны, масштаб и сдвиг сохраняют точку под пальцем', () => {
  const cam = { center: [10, -20], rot: 0.5, tilt: 0.7, ppcm: 6 }, W = 800, H = 500;
  for (const [x, y] of [[400, 250], [120, 400], [700, 300]]) { const P = unproject(cam, x, y, W, H); const s = project(cam, P, W, H); assert.ok(Math.hypot(s[0] - x, s[1] - y) < 1e-6); }
  assert.equal(unproject({ ...cam, tilt: 1.3 }, 400, 0, W, H), null, 'выше горизонта точки нет');
  const c = { ...cam }, before = unproject(c, 300, 200, W, H); zoomAt(c, 1.7, 300, 200, W, H); const after = unproject(c, 300, 200, W, H); assert.ok(Math.hypot(before[0] - after[0], before[1] - after[1]) < 1e-6);
  const lim = { ...cam }; zoomAt(lim, 100, 400, 250, W, H, [1.2, 8]); assert.equal(lim.ppcm, 8, 'предел приближения для фото низкого разрешения');
  const p = { ...cam }, P0 = unproject(p, 500, 350, W, H); panBy(p, 500, 350, 560, 380, W, H); const P1 = unproject(p, 560, 380, W, H); assert.ok(Math.hypot(P0[0] - P1[0], P0[1] - P1[1]) < 1e-6);
  assert.equal(clampTilt(5), TILT_MAX); assert.equal(clampTilt(-1), 0);
});
test('карта рельефа: градиент даёт нормаль в нужную сторону, ровная плитка — плоская, неквадратное фото работает', () => {
  const n = 32, flat = new Uint8ClampedArray(n * n * 4).fill(128); for (let i = 3; i < flat.length; i += 4) flat[i] = 255;
  const nf = buildNormalMap(flat, n); assert.ok(Math.abs(nf[0] - 128) <= 1 && Math.abs(nf[1] - 128) <= 1 && nf[2] >= 254);
  const ramp = new Uint8ClampedArray(n * n * 4); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const o = (y * n + x) * 4; ramp[o] = ramp[o + 1] = ramp[o + 2] = x * 8; ramp[o + 3] = 255; }
  const nr = buildNormalMap(ramp, n, { blur: 1 }), o = (16 * n + 16) * 4; assert.ok(nr[o] < 128, 'высота растёт вправо → нормаль смотрит влево'); assert.equal(nr[o + 3] > 0 && nr[o + 3] < 255, true);
  const w = 40, h = 24, rect = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { rect[i * 4] = rect[i * 4 + 1] = rect[i * 4 + 2] = (i % w) * 6; rect[i * 4 + 3] = 255; }
  const nrect = buildNormalMap(rect, w, h, { blur: 1 }); assert.equal(nrect.length, w * h * 4); assert.ok(nrect[(12 * w + 20) * 4] < 128);
  assert.deepEqual(averageColor(flat, n).map(Math.round), [128, 128, 128]); assert.deepEqual(averageColor(rect, w, h).length, 3);
});
test('качество: слабые устройства получают упрощённый режим, без WebGL 2 — запасной', () => {
  assert.equal(detectTier({ webgl2: false }).tier, 'fallback'); assert.equal(detectTier({ renderer: 'Google SwiftShader' }).tier, 'low');
  assert.equal(detectTier({ mobile: true, cores: 8, memory: 8, renderer: 'Apple GPU' }).tier, 'medium'); assert.equal(detectTier({ mobile: true, memory: 2 }).tier, 'low');
  assert.equal(detectTier({ renderer: 'NVIDIA GeForce RTX' }).tier, 'high'); assert.equal(detectTier({ forceLite: true }).tier, 'low'); assert.equal(detectTier({ saveData: true }).tier, 'low');
  assert.ok(START_LEVEL.low > START_LEVEL.high && LEVELS[START_LEVEL.low].q === 2);
});
test('адаптация: тормоза опускают уровень, стабильная скорость — осторожно поднимают, границы соблюдаются', () => {
  const a = new Adaptive(0, { slowFrames: 10, fastFrames: 20, cooldown: 3 }); let changed = null;
  for (let i = 0; i < 12; i++) changed = a.push(60) || changed; assert.equal(a.level, 1); assert.equal(changed.dir, 'down');
  for (let i = 0; i < 100; i++) a.push(60); assert.ok(a.level <= LEVELS.length - 1);
  const b = new Adaptive(2, { slowFrames: 10, fastFrames: 20, cooldown: 0, min: 2 }); for (let i = 0; i < 100; i++) b.push(8); assert.equal(b.level, 2, 'min не нарушается');
  const c = new Adaptive(3, { fastFrames: 20, cooldown: 0 }); for (let i = 0; i < 25; i++) c.push(8); assert.equal(c.level, 2);
});
test('движение: шторка перехода покрывает кадр целиком, свет в границах, сценарий ролика меняет материал или сутки', () => {
  assert.equal(sweepFor(0, 0.56).on, false); assert.equal(sweepFor(1, 0.56).on, false);
  const s0 = sweepFor(0.001, 0.56), s1 = sweepFor(0.999, 0.56); assert.ok(s0.pos < -0.3 && s1.pos > 0.3);
  for (let a = 0; a < 7; a += 0.5) for (const m of ['day', 'evening', 'side']) { const l = lightAt(m, a); assert.ok(Math.hypot(l.x, l.y) < 100 && l.h >= 6); }
  const base = { a: 0, b: 1, mode: 'evening', compare: true, cam: { center: [0, 0], rot: 0, tilt: 0.6, ppcm: 5 }, light: { x: 0, y: 0, h: 20 }, sweep: { on: true } };
  const st = t => choreograph(base, t, { duration: 7, from: 0, to: 1 });
  assert.equal(st(0).a, 0); assert.equal(st(0).sweep.on, false); assert.ok(st(3.5).sweep.on); assert.equal(st(6.9).a, 1); assert.equal(st(6.9).compare, false);
  assert.ok(st(7).cam.ppcm > st(0).cam.ppcm); assert.equal(easeInOut(0), 0); assert.equal(easeInOut(1), 1);
  const tb = { ...base, mode: 'time', hour: 13 }, tt = t => choreograph(tb, t, { duration: 7 });
  assert.ok(tt(0).hour < tt(3.5).hour && tt(3.5).hour < tt(7).hour && tt(0).sky && tt(7).sky.key === 'moon', 'в режиме суток ролик — смена времени суток');
});

// ------------------------------------------------------------------------------------------------ слэбы 120×278
test('слэбы: в каталоге ровно 57 изделий 120×278 из 16 коллекций; ящик и мозаика не входят; примеры из задачи идут первыми', () => {
  const slabs = slabList(entries); assert.equal(slabs.length, 57); assert.equal(new Set(slabs.map(e => e.collectionId)).size, 16);
  assert.ok(slabs.every(e => e.formatKey === SLAB_FORMAT && e.eligible && e.photo[0] === 120 && e.photo[1] === 278)); assert.ok(!slabs.some(e => e.code === '450080000001'), 'транспортный ящик');
  assert.deepEqual(slabs.slice(0, SLAB_PRIORITY.length).map(e => e.code), SLAB_PRIORITY); assert.ok(isSlab(slabs[0]) && !isSlab(eligible.find(e => e.formatKey === '60X60')));
  const p = products.filter(p => String(p.format).toUpperCase() === SLAB_FORMAT && String(p.name).toUpperCase().indexOf('ЯЩИК') < 0); assert.ok(p.length >= 57);
  assert.ok(slabs.every(e => e.imgW >= 147 && e.imgW <= 150 && e.imgH === 341), 'все 57 фото каталога — 147–150×341'); assert.ok(slabs.every(e => e.quality === 'lite' && e.surf.relief === 0 && e.surf.micro === 0), 'упрощённый режим без дорисовки');
  assert.ok(slabs.every(e => /^\d{12}$/.test(e.code) && e.priceText.includes('₽') && e.href.endsWith(`product/${e.code}/`)), 'цены и ссылки — из каталога');
  const named = Object.fromEntries(slabs.map(e => [e.code, e.name])); assert.equal(named['600180000132'], 'Прима Деним Рэд'); assert.equal(named['600180000133'], 'Прима Волкано Грин'); assert.equal(named['600180000086'], 'Статус Кортен'); assert.equal(named['600180000076'], 'Аура Калакатта Скай'); assert.equal(named['600180000072'], 'Магма Альпи Грин');
});
test('слэбы находятся поиском по названию, коллекции и артикулу', () => {
  assert.equal(search(index, 'калакатта').filter(isSlab)[0].code.slice(0, 8), '60018000'); assert.equal(search(index, '600180000133')[0].name, 'Прима Волкано Грин'); 
  assert.ok(search(index, 'стелларис', { limit: 200 }).filter(isSlab).length >= 9, 'коллекция Стелларис: 9 слэбов'); assert.ok(search(index, '120x278', { limit: 200 }).filter(isSlab).length >= 50);
});
test('имена слэбов: сокращённый префикс коллекции раскрывается', () => { assert.equal(cleanName('ПРИ.ВОЛКАНО ГРИН 120X278 ЛЮКС', 'ПРИМА'), 'Прима Волкано Грин'); assert.equal(cleanName('АВА.БЛЭК 120X278', 'АВАНГАРД'), 'Авангард Блэк'); assert.equal(cleanName('СТАТУС КОРТЕН 120X278', 'СТАТУС'), 'Статус Кортен'); });
test('свет у стены: орбита в границах, высота — расстояние от стены', () => {
  for (let a = 0; a < 7; a += 0.5) for (const m of ['day', 'evening', 'side']) { const l = lightAtWall(m, a); assert.ok(Math.abs(l.x) <= 160 && Math.abs(l.y) <= 90 && l.h >= 6 && l.h <= 100, JSON.stringify(l)); }
  assert.ok(WALL_PRESETS.side.h < WALL_PRESETS.day.h, 'боковой свет скользит ближе к стене');
});
test('ссылка на композицию хранит раздел слэбов и число плит', () => {
  const s = { view: 'slabs', slabs: 3, code: '600180000076', second: '600180000133', compare: true, mode: 'evening', hour: 13, format: '60x60', turned: true, jointMm: 3, jointColor: 'tone', bond: 'straight', cam: { rot: 0, tilt: 0.04, ppcm: 1.4 } };
  const back = decode(encode(s)); assert.equal(back.view, 'slabs'); assert.equal(back.slabs, 3); assert.equal(back.code, '600180000076'); assert.equal(back.turned, true); assert.equal(decode('w=s&n=99').slabs, 4); assert.equal(decode('w=s&n=x').slabs, 2); assert.equal(decode('m=600180000076').view, undefined);
});
// --- оригиналы высокого разрешения
const png = (w, h) => {
  const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 255 / w) | 0; raw[o + 1] = (y * 255 / h) | 0; raw[o + 2] = 128; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
test('размер файла по заголовку: PNG, JPEG, WebP; мусор — null', () => {
  assert.deepEqual(imageSize(png(321, 123)), { type: 'png', width: 321, height: 123 });
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x06, 0x84, 0x02, 0xd0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]); assert.deepEqual(imageSize(jpg), { type: 'jpeg', width: 720, height: 1668 });
  const webp = Buffer.alloc(30); webp.write('RIFF', 0); webp.write('WEBP', 8); webp.write('VP8X', 12); webp.writeUIntLE(719, 24, 3); webp.writeUIntLE(1667, 27, 3); assert.deepEqual(imageSize(webp), { type: 'webp', width: 720, height: 1668 });
  assert.equal(imageSize(Buffer.from('not an image at all, just text')), null);
});
test('оригинал принимается только с совпадающими пропорциями и достаточным размером; растягивать нельзя', () => {
  const slab = products.find(p => p.code === '600180000076'), ok = { src: 'media/lab/x.jpg', width: 720, height: 1668 };
  assert.equal(checkOriginal(slab, ok), ''); assert.match(checkOriginal(slab, { ...ok, width: 1668, height: 720 }), /пропорции/); assert.match(checkOriginal(slab, { ...ok, width: 1000, height: 1000 }), /пропорции/);
  assert.match(checkOriginal(slab, { ...ok, width: 300, height: 695 }), /меньше/); assert.match(checkOriginal(slab, { src: 'x' }), /размер/); assert.match(checkOriginal({ format: 'МОЗАИКА 30X30' }, ok), /формат/);
  const out = applyOriginals(products, { items: { '600180000076': ok, '600180000133': { ...ok, width: 900, height: 900 } } });
  const a = out.find(p => p.code === '600180000076'), b = out.find(p => p.code === '600180000133'); assert.equal(a.image.width, 720); assert.equal(a.image.original, true); assert.equal(b.image.width, products.find(p => p.code === '600180000133').image.width, 'неподходящий оригинал игнорируется');
  const e = toEntry(a, { root: './' }); assert.equal(e.quality, 'hd'); assert.equal(e.original, true); assert.ok(e.surf.relief > 0 && e.maxPpcm === 40); assert.equal(applyOriginals(products, null), products);
  // телефон получает уменьшенную копию; неподходящая мобильная копия не мешает основной
  const two = { items: { '600180000076': { ...ok, width: 1993, height: 4615, mobile: { src: 'media/lab/x-m.webp', width: 1001, height: 2320 } }, '600180000072': { ...ok, mobile: { src: 'media/lab/y-m.webp', width: 500, height: 1159 } } } };
  const pick = (list, code) => list.find(p => p.code === code).image;
  assert.deepEqual([pick(applyOriginals(products, two), '600180000076').width, pick(applyOriginals(products, two, { mobile: true }), '600180000076').width], [1993, 1001]);
  assert.equal(pick(applyOriginals(products, two, { mobile: true }), '600180000076').src, 'media/lab/x-m.webp'); assert.equal(pick(applyOriginals(products, two, { mobile: true }), '600180000072').width, 720);
});
test('сборка оригиналов: нужен источник и подтверждение, файл с верными пропорциями и контрольной суммой; всё лишнее отклоняется с причиной', async () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'lab-orig-')), media = resolve(dir, 'media'); mkdirSync(media);
  const good = png(720, 1668), bad = png(800, 800); writeFileSync(resolve(media, 'good.png'), good); writeFileSync(resolve(media, 'bad.png'), bad);
  const { createHash } = await import('node:crypto'), sha = b => createHash('sha256').update(b).digest('hex');
  const man = { v: 1, items: {
    '600180000076': { file: 'good.png', sha256: sha(good), mobile: { file: 'good.png' }, sourceUrl: 'https://example.test/original', evidence: 'проверено вручную по артикулу' },
    '600180000072': { file: 'good.png', mobile: { file: 'bad.png' }, sourceUrl: 'https://example.test/m', evidence: 'проверено' },
    '600180000133': { file: 'bad.png', sourceUrl: 'https://example.test/x', evidence: 'проверено' },
    '600180000132': { file: 'good.png', evidence: 'нет источника' },
    '600180000086': { file: 'good.png', sha256: 'deadbeef', sourceUrl: 'https://example.test/y', evidence: 'проверено' },
    '600180000087': { file: 'missing.png', sourceUrl: 'https://example.test/z', evidence: 'проверено' },
    '000000000000': { file: 'good.png', sourceUrl: 'https://example.test/q', evidence: 'нет в каталоге' } } };
  writeFileSync(resolve(dir, 'man.json'), JSON.stringify(man)); const log = [];
  const r = await buildOriginals({ products, manifestPath: resolve(dir, 'man.json'), dir: media, log: m => log.push(m) });
  assert.deepEqual(Object.keys(r.items), ['600180000076']); assert.equal(r.items['600180000076'].width, 720); assert.equal(r.items['600180000076'].src, 'media/lab/good.png');
  assert.deepEqual(r.items['600180000076'].mobile, { src: 'media/lab/good.png', width: 720, height: 1668 });
  assert.equal(r.rejected.length, 6); const why = Object.fromEntries(r.rejected.map(x => [x.code, x.reason])); assert.match(why['600180000072'], /мобильная версия: пропорции/); assert.match(why['600180000133'], /пропорции/); assert.match(why['600180000132'], /источник/); assert.match(why['600180000086'], /контрольная/); assert.match(why['600180000087'], /нет файла/); assert.match(why['000000000000'], /каталоге/);
  assert.deepEqual((await buildOriginals({ products, manifestPath: resolve(dir, 'none.json'), dir: media })).items, {}, 'нет файла списка — нет оригиналов');
});
// --- конвейер ARCHITALON (scripts/lab-slabs-sync.mjs): сопоставление файла с артикулом и дополнительные фейсы
test('файл ARCHITALON сопоставляется с артикулом только однозначно; другой формат и неизвестное — не присваиваются', async () => {
  const { slabTargets } = await import('../scripts/lab-slab-targets.mjs'), { prepareTargets, matchSource } = await import('../scripts/lab-slabs-match.mjs');
  const all = slabTargets(products); assert.equal(all.count, 57); assert.ok(all.items.every(t => t.collectionId !== 'packaging'));
  const t = prepareTargets(all.items), m = (a, e) => matchSource(t, a, e);
  // имена реальных архивов (первые пять слэбов)
  assert.deepEqual([['aura-calacatta-sky-120x278.zip', 'calacatta_sky_120x278_F3.tif'], ['magma-alpi-green-120x278.zip', 'alpi_green_120x278_F1.tif'], ['magma-dover-tiger-120x278.zip', 'dover_tiger_120x278_F4.tif'],
    ['status-copper-120x278.zip', 'copper_120x278_F2.tif'], ['status-corten-120x278.zip', 'corten_120x278_F1.tif']].map(([a, e]) => [m(a, e).code, m(a, e).face]),
  [['600180000076', 'F3'], ['600180000072', 'F1'], ['600180000073', 'F4'], ['600180000087', 'F2'], ['600180000086', 'F1']]);
  // сокращённые русские названия каталога ↔ латиница
  assert.equal(m('charme-deluxe-120x278.zip', 'bianco_michelangelo_120x278_F1.tif').code, '600180000004');
  assert.equal(m('charme-deluxe-sahara-noir.zip', 'F1.tif').code, '600180000008');
  assert.equal(m('continuum-stone-beige-120x278.zip', 'F2.tif').code, '600180000033');
  assert.equal(m('avantgarde-calacatta-warm.zip', 'a.tif').code, '600180000062');
  assert.equal(m('stellaris-calacatta-gold.zip', 'a.tif').code, '600180000044', 'Калакатта Голд есть и в Метрополисе — решает коллекция');
  assert.equal(m('metropolis-calacatta-gold.zip', 'a.tif').code, '600180000019');
  assert.equal(m('forum.zip', 'forum_slim_polar_120x278.tif').code, '600180000078');
  // не хватает слова, чужой формат, посторонний файл
  assert.equal(m('forum.zip', 'forum_polar_120x278.tif').status, 'none', 'Слим или Стоун — неизвестно');
  assert.equal(m('stellaris-calacatta-gold-120x278.zip', 'calacatta_gold_60x120_F1.tif').status, 'other-format', 'формат в имени файла важнее имени архива');
  assert.equal(m('photos.zip', 'IMG_0001.jpg').status, 'none');
  // одинаково подходят два артикула — карантин
  const twins = prepareTargets([{ code: '1', collection: 'ФОРУМ', name: 'ФОРУМ ПОЛАР 120X278' }, { code: '2', collection: 'ФОРУМ', name: 'ФОРУМ ПОЛАР 120X278' }]);
  assert.deepEqual([matchSource(twins, 'forum-polar.zip').status, matchSource(twins, 'forum-polar.zip').candidates], ['ambiguous', ['1', '2']]);
});
test('оригиналы: дополнительные фейсы публикуются списком faces; битый фейс не отключает основной файл', async () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'lab-faces-')), media = resolve(dir, 'media'); mkdirSync(media);
  writeFileSync(resolve(media, 'f1.png'), png(720, 1668)); writeFileSync(resolve(media, 'f2.png'), png(721, 1669)); writeFileSync(resolve(media, 'sq.png'), png(800, 800));
  writeFileSync(resolve(dir, 'man.json'), JSON.stringify({ v: 1, items: { '600180000076': { file: 'f1.png', face: 'F1', sourceUrl: 'architalon:a.zip/F1.tif', evidence: 'проверено',
    faces: [{ face: 'F2', file: 'f2.png', mobile: { file: 'f2.png' } }, { face: 'F3', file: 'sq.png' }, { face: 'F4', file: 'missing.png' }] } } }));
  const log = [], r = await buildOriginals({ products, manifestPath: resolve(dir, 'man.json'), dir: media, log: m => log.push(m) });
  const it = r.items['600180000076']; assert.equal(it.src, 'media/lab/f1.png'); assert.equal(it.face, 'F1'); assert.equal(r.rejected.length, 0);
  assert.deepEqual(it.faces, [{ face: 'F2', src: 'media/lab/f2.png', width: 721, height: 1669, mobile: { src: 'media/lab/f2.png', width: 721, height: 1669 } }]);
  assert.equal(log.length, 2); assert.match(log[0], /F3: пропорции/); assert.match(log[1], /F4: нет файла/);
  assert.equal(applyOriginals(products, r).find(p => p.code === '600180000076').image.src, 'media/lab/f1.png', 'лаборатория по-прежнему берёт основной файл');
});
