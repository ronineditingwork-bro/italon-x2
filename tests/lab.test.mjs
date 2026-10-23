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
import { labAsset, parseFormat, cleanName, surfaceFor, toEntry, buildIndex, search, classify, filterEntries, facetsOf, sortEntries, HD_MIN_SIDE, COLOR_FAMILIES } from '../site/shared/lab/catalog.mjs';
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
