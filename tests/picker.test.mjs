// Подбор керамогранита: признаки изображений, таблица признаков каталога, разбор описания и выдача по реальному каталогу (1202 позиции).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import * as F from '../site/shared/picker-features.mjs';
import * as T from '../site/shared/picker-text.mjs';
import { products as rawProducts, categoryOf } from '../site/data.mjs';

const root = resolve(import.meta.dirname, '..');
const featuresFile = JSON.parse(readFileSync(resolve(root, 'data/picker-features.json'), 'utf8'));
const products = rawProducts.map(p => ({ ...p, image: p.image ? { ...p.image, src: p.image.src.replace(/^\//, '') } : null, category: categoryOf(p) }));
const featOf = new Map(); const feat = p => { const s = p.image?.src; if (!s || !featuresFile.items[s]) return null; if (!featOf.has(s)) featOf.set(s, F.unpack(F.fromBase64(featuresFile.items[s].f))); return featOf.get(s); };
const attrCache = new Map(); const attrsOf = p => { if (!attrCache.has(p.code)) { const f = feat(p); attrCache.set(p.code, f ? T.attributesOf(p, f) : null); } return attrCache.get(p.code); };
const search = (text, opts) => T.searchByText(text, products, attrsOf, opts);
const top = (text, n = 10) => search(text, { limit: 60 }).results.slice(0, n);
const price = p => p.priceKopecks / 100;

// ---------------------------------------------------------------- признаки изображений
function solid(w, h, [r, g, b]) { const data = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) data.set([r, g, b, 255], i * 4); return { data, width: w, height: h }; }
function stripes(w, h, vertical, a = [200, 170, 120], b = [150, 120, 80]) { const im = solid(w, h, a); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (((vertical ? x : y) >> 2) % 2) im.data.set([...b, 255], (y * w + x) * 4); return im; }
const rotate90 = ({ data, width, height }) => { const out = new Uint8ClampedArray(data.length); for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out.set(data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4), (x * height + (height - 1 - y)) * 4); return { data: out, width: height, height: width }; };

test('признаки: одинаковые изображения совпадают, разные цвета различаются, упаковка почти без потерь', () => {
  const a = F.describe(solid(64, 64, [180, 180, 175])), a2 = F.describe(solid(80, 50, [180, 180, 175])), red = F.describe(solid(64, 64, [170, 60, 50])), dark = F.describe(solid(64, 64, [40, 40, 40]));
  assert.ok(F.distance(a, a2) < 0.02, 'тот же цвет в другом размере');
  assert.ok(F.distance(a, red) > 0.3 && F.distance(a, dark) > 0.3, 'другой цвет заметно дальше');
  const back = F.unpack(F.pack(a)); assert.ok(F.distance(a, back) < 0.02, 'упаковка uint8 почти не меняет расстояние');
  assert.equal(F.fromBase64(F.toBase64(F.pack(a))).length, F.pack(a).length);
  assert.equal(F.similarity(0), 100); assert.equal(F.similarity(0.6), 0);
});
test('признаки: полосы не зависят от поворота снимка, но отличаются от ровного фона', () => {
  const v = F.describe(stripes(96, 96, true)), h = F.describe(stripes(96, 96, false)), rot = F.describe(rotate90(stripes(96, 96, true))), flat = F.describe(solid(96, 96, [175, 145, 100]));
  assert.ok(F.distance(v, h) < 0.06 && F.distance(v, rot) < 0.06, 'поворот на 90° почти не меняет описание');
  assert.ok(F.distance(v, flat) > F.distance(v, h) * 2, 'полосатый и ровный — заметно разные');
  assert.ok(v.tex.coherence > 0.8 && flat.tex.coherence < 0.2);
});
test('признаки: белый фон каталога обрезается по плитке', () => {
  const w = 100, h = 100, im = solid(w, h, [255, 255, 255]); for (let y = 20; y < 80; y++) for (let x = 30; x < 70; x++) im.data.set([120, 100, 90, 255], (y * w + x) * 4);
  const b = F.tileBounds(im); assert.ok(b.x >= 30 && b.x <= 33 && b.y >= 20 && b.y <= 23 && b.w <= 40 && b.w >= 34 && b.h >= 54 && b.h <= 60, JSON.stringify(b));
  const d = F.describe(im, { crop: true }); assert.ok(Math.abs(d.mean[0] - F.rgbToLab(120, 100, 90)[0]) < 3, 'средний цвет — цвет плитки, без белого фона');
});

// ---------------------------------------------------------------- таблица признаков каталога
test('таблица признаков: у каждого фото каталога есть признаки, они не устарели и не повреждены', () => {
  const srcs = new Set(products.map(p => p.image?.src).filter(Boolean));
  assert.ok(srcs.size >= 1100);
  const missing = [...srcs].filter(s => !featuresFile.items[s]);
  assert.deepEqual(missing, [], 'нет признаков для фото — выполните node scripts/build-picker-features.cjs');
  const len = F.pack(F.describe(solid(48, 48, [1, 2, 3]))).length;
  for (const s of srcs) {
    const e = featuresFile.items[s]; assert.equal(F.fromBase64(e.f).length, len, s);
    const file = resolve(root, 'public', s); if (existsSync(file)) assert.equal(createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 8), e.h, `фото изменилось, признаки устарели: ${s}`);
  }
  const extra = Object.keys(featuresFile.items).filter(s => !srcs.has(s)); assert.deepEqual(extra, [], 'лишние признаки (фото убрано из каталога)');
});
test('подбор по фото: каждое фото каталога своим же описанием находит само себя первым (1167 рисунков)', () => {
  const entries = Object.entries(featuresFile.items).map(([src, e]) => [src, F.unpack(F.fromBase64(e.f))]);
  let wrong = 0, ties = 0;
  for (const [src, f] of entries) {
    let best = null, bestD = 1e9, second = 1e9;
    for (const [s2, g] of entries) { const d = F.distance(f, g); if (d < bestD) { second = bestD; bestD = d; best = s2; } else if (d < second) second = d; }
    if (best !== src) wrong++; if (second < 0.002) ties++;
  }
  assert.ok(wrong <= 3, `само себя не нашли: ${wrong}`);
  assert.ok(ties < entries.length * 0.04, `почти одинаковых рисунков: ${ties}`);
});
test('подбор по фото: ближайшие соседи плитки — того же цвета и рисунка (светлота не расходится сильнее 20 единиц)', () => {
  const entries = Object.entries(featuresFile.items).map(([src, e]) => [src, F.unpack(F.fromBase64(e.f))]);
  let bad = 0, n = 0;
  for (let i = 0; i < entries.length; i += 7) {
    const f = entries[i][1]; const near = entries.map(([s, g]) => [F.distance(f, g), g]).sort((a, b) => a[0] - b[0]).slice(1, 6);
    for (const [, g] of near) { n++; if (Math.abs(g.mean[0] - f.mean[0]) > 20) bad++; }
  }
  assert.ok(bad / n < 0.1, `слишком много соседей другой светлоты: ${bad}/${n}`);
});

// ---------------------------------------------------------------- разбор описания
test('разбор: цвета, составные слова, тон, рисунок, поверхность, формат, цена, раздел', () => {
  let q = T.parseQuery('светло-серый под бетон, матовый, 60х120, до 5000 руб');
  assert.ok(q.colors.has('gray') && q.tones.has('light') && q.looks.has('concrete') && q.finishes.has('matte'));
  assert.deepEqual(q.formats, ['60X120']); assert.equal(q.priceMax, 5000);
  q = T.parseQuery('бело-серый мрамор'); assert.ok(q.colors.has('white') && q.colors.has('gray') && q.looks.has('marble'));
  q = T.parseQuery('тёмно-коричневое дерево'); assert.ok(q.colors.has('brown') && q.tones.has('dark') && q.looks.has('wood'));
  q = T.parseQuery('от 3 до 6 тыс'); assert.equal(q.priceMin, 3000); assert.equal(q.priceMax, 6000);
  q = T.parseQuery('плитка 3000-4500 ₽'); assert.equal(q.priceMin, 3000); assert.equal(q.priceMax, 4500);
  q = T.parseQuery('не дороже 4,5 тыс. руб.'); assert.equal(q.priceMax, 4500);
  q = T.parseQuery('дешевле 2500'); assert.equal(q.priceMax, 2500);
  q = T.parseQuery('для террасы и двора'); assert.equal(q.section, 'x2'); assert.ok(q.outdoor);
  q = T.parseQuery('80 на 160 большой формат глянец'); assert.deepEqual(q.formats, ['80X160']); assert.equal(q.formatClass, 'large'); assert.ok(q.finishes.has('gloss'));
  q = T.parseQuery('мозаика бежевая'); assert.equal(q.category, 'mosaic'); assert.ok(q.colors.has('beige'));
  q = T.parseQuery('чёрный мрамор с золотыми прожилками'); assert.ok(q.colors.has('black') && !q.colors.has('yellow') && q.detailColors.has('yellow'), 'золотые прожилки — не цвет плитки');
  q = T.parseQuery('без прожилок, однотонный'); assert.ok(q.notLooks.has('marble') && q.looks.has('plain'));
  q = T.parseQuery('610010002780'); assert.equal(q.code, '610010002780');
  q = T.parseQuery('в стиле лофт'); assert.ok(q.styles.length === 1 && q.looks.has('concrete'));
  assert.ok(T.parseQuery('').colors.size === 0 && T.parseQuery(null).raw === '');
});
test('разбор: странный и враждебный ввод не ломает подбор', () => {
  for (const s of ['<img src=x onerror=alert(1)>', 'a'.repeat(5000), '🧱🧱🧱', '\u0000\u0001', "'; DROP TABLE quotes;--", '((((', '100000000000000000000000 руб', '0x0', '###', 'до до до до', '-5000']) {
    const r = search(s); assert.ok(Array.isArray(r.results) && Array.isArray(r.understood), s.slice(0, 20));
  }
});

// ---------------------------------------------------------------- выдача по описанию (реальный каталог)
test('выдача: «светло-серый под бетон, матовый, 60×120, до 5000 ₽» — все десять первых подходят по условиям', () => {
  const r = top('светло-серый под бетон, матовый, 60×120, до 5000 ₽');
  assert.equal(r.length, 10);
  for (const x of r) { const a = attrsOf(x.p); assert.equal(x.p.format, '60X120'); assert.ok(price(x.p) <= 5000); assert.match(x.p.finish.toLowerCase(), /натураль|матов|силк|шлиф/); assert.ok(a.L > 50 && a.C < 12, `${x.p.name} L${a.L} C${a.C}`); }
});
test('выдача: цвет определяется по пикселям — «чёрный», «белый глянцевый», «бежевый», «зелёный»', () => {
  for (const x of top('чёрный мрамор')) assert.ok(attrsOf(x.p).L < 38, x.p.name + ' ' + attrsOf(x.p).L);
  for (const x of top('белый глянцевый')) { assert.ok(attrsOf(x.p).L > 78 && attrsOf(x.p).C < 12, x.p.name); assert.match(x.p.finish.toLowerCase(), /люкс|полир/); }
  for (const x of top('бежевый')) { const a = attrsOf(x.p); assert.ok(a.L > 55 && a.C > 6 && a.h > 45 && a.h < 118, `${x.p.name} L${a.L} C${a.C} h${a.h}`); }
  for (const x of top('зелёный', 6)) { const a = attrsOf(x.p); assert.ok(a.h > 95 && a.h < 210 && a.C > 4, `${x.p.name} h${a.h} C${a.C}`); }
});
test('выдача: «для террасы» — только X2 (20 мм); «Coliseum» — только Coliseum; формат и цена — жёсткие условия', () => {
  const t = search('дерево для террасы'); assert.ok(t.results.length >= 5); for (const x of t.results) assert.equal(x.p.section, 'x2');
  for (const x of top('серый coliseum')) assert.equal(x.p.section, 'coliseum');
  for (const x of search('серый до 2000 руб', { limit: 80 }).results) assert.ok(price(x.p) <= 2000 && x.p.priceKopecks > 0);
  for (const x of search('120х278 светлый', { limit: 80 }).results) assert.equal(x.p.format, '120X278');
});
test('выдача: по названию и артикулу — «калакатта», «этернум кофи», код', () => {
  const k = top('калакатта', 6); assert.ok(k.every(x => /КАЛАКАТТА/.test(x.p.name)), k.map(x => x.p.name).join('; '));
  const e = top('этернум кофи', 4); assert.ok(e.every(x => /ЭТЕРНУМ/.test(x.p.name + x.p.collection) && /КОФИ/.test(x.p.name)), e.map(x => x.p.name).join('; '));
  const code = rawProducts[100].code; const c = search(code); assert.equal(c.results[0].p.code, code); assert.ok(c.results.length === 1);
});
test('выдача: условия, которые не выполнить, смягчаются с пояснением, а не «ничего»; бессмыслица — понятный пустой ответ', () => {
  const r = search('серый до 100 руб'); assert.ok(r.results.length > 0 && r.relaxed === 'цену' && r.notes.some(n => /без ограничения/.test(n)));
  const n = search('qwertyuiop asdfgh'); assert.equal(n.results.length, 0); assert.equal(n.understood.length, 0);
  assert.equal(search('').results.length, 0);
});
test('выдача: у каждого результата есть причины, нет дублей одного рисунка, цены и форматы берутся из каталога', () => {
  const r = search('светлый мрамор с серыми прожилками, глянец', { limit: 40 });
  assert.ok(r.results.length >= 10); const keys = new Set();
  for (const x of r.results) { assert.ok(x.reasons.length > 0, x.p.name); const key = `${x.p.collectionId}|${x.p.image.src}`; assert.ok(!keys.has(key), 'дубль ' + x.p.name); keys.add(key); assert.ok(rawProducts.some(p => p.code === x.p.code)); }
});
test('выдача: мозаика и декор не вылезают в обычный запрос, но находятся по просьбе', () => {
  for (const x of top('серый мрамор', 10)) assert.equal(x.p.category, 'plate', x.p.name);
  const m = top('мозаика серая', 8); assert.ok(m.length === 8 && m.every(x => x.p.category === 'mosaic'));
});
