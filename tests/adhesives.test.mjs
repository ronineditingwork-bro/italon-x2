// Рекомендации клея (src/adhesives.mjs, data/italon-adhesives-2021.json): таблицы Italon и Mapei, подбор по формату, корзина и КП.
import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../data/italon-adhesives-2021.json' with { type: 'json' };
import { adhesiveFor, adhesiveLabel, adhesiveTable, plateSize } from '../src/adhesives.mjs';
import { products } from '../site/data.mjs';

const one = (section, format) => products.find(p => p.section === section && p.format === format) || assert.fail(`нет товара ${section} ${format}`);
const text = (p, use) => { const a = adhesiveFor(p); return a && adhesiveLabel(a.rows[use || a.use]); };
// только клеи из прайса Mapei: Keraflex без серии, Ultralite S1, Granirapid и быстрые клеи сняты с поставки
const P7 = 'Adesilex P7 (C2T)', C2TE = 'Adesilex P9 (C2TE)', S1 = 'Keraflex Extra S1 или Keraflex Maxi S1 (C2TE S1)';
const S2 = 'Ultralite S2 (C2E S2), Kerabond T-R + Isolastic (C2E S2) или Ultraflex S2 (C2TE S2)';

test('клей: три таблицы статьи переписаны полностью — 19, 18 и 20 размеров; у каждого клея есть класс', () => {
  const sizes = id => data.tables[id].rows.flatMap(r => r.sizes);
  assert.deepEqual(Object.keys(data.tables), ['interior', 'exteriorFloor', 'exteriorWall']);
  assert.deepEqual([sizes('interior').length, sizes('exteriorFloor').length, sizes('exteriorWall').length], [19, 18, 20]);
  for (const t of Object.values(data.tables)) {
    assert.equal(new Set(t.rows.flatMap(r => r.sizes)).size, t.rows.flatMap(r => r.sizes).length, 'размер записан дважды');
    for (const r of t.rows) { assert.ok(r.adhesives.length); for (const [name, c] of r.adhesives) assert.ok(name && /^(C[12]|R2)/.test(c), `${name}: ${c}`); }
  }
  assert.ok(!sizes('interior').includes('2780x1200x6'), 'слэба в интерьерной таблице нет');
  assert.ok(sizes('exteriorFloor').includes('2780x1200x6') && sizes('exteriorWall').includes('2780x1200x6'));
  assert.ok(!sizes('exteriorFloor').some(s => /^(750x250|800x400)/.test(s)), 'настенная плитка — не на пол');
  assert.equal(data.source.date, '2021-09-15');
});

test('клей: интерьерная плитка получает клей по своему формату — чем крупнее плита, тем эластичнее клей', () => {
  assert.deepEqual(plateSize(one('italon', '60X120')), [600, 1200]);
  assert.equal(adhesiveFor(one('italon', '60X120')).use, 'interior');
  assert.equal(text(one('italon', '30X30')), P7);
  for (const f of ['30X60', '60X60']) assert.equal(text(one('italon', f)), C2TE, f);
  for (const f of ['60X120', '80X80']) assert.equal(text(one('italon', f)), S1, f);
  for (const f of ['80X160', '20X160']) assert.equal(text(one('italon', f)), S2, f);
  assert.equal(text(one('contract', '60X120')), S1);                                   // «Контракт» — та же плита Italon
});

test('клей: на улице тем же форматам нужен более эластичный клей — строки из уличных таблиц', () => {
  const p60 = one('italon', '60X60'), p120 = one('italon', '60X120'), p30 = one('italon', '30X30');
  assert.equal(text(p60, 'exteriorFloor'), S1); assert.equal(text(p60, 'exteriorWall'), S1);
  assert.equal(text(p120, 'exteriorFloor'), S2); assert.equal(text(p120, 'exteriorWall'), S2);
  assert.equal(text(p30, 'exteriorFloor'), 'Adesilex P7 (C2T) или Adesilex P9 (C2TE)');
  assert.equal(text(p30, 'exteriorWall'), 'Kerabond T-R (C1T), Adesilex P7 (C2T) или Adesilex P9 (C2TE)');
});

test('клей: X2 60×60 (20 мм) — уличная таблица «на пол»; для 60×120 и 30×120 толщиной 20 мм строки в таблицах нет', () => {
  const x2 = adhesiveFor(one('x2', '60X60'));
  assert.equal(x2.use, 'exteriorFloor'); assert.equal(adhesiveLabel(x2.rows.exteriorFloor), S1);
  assert.equal(adhesiveLabel(x2.rows.interior), C2TE); assert.equal(adhesiveLabel(x2.rows.exteriorWall), S1);
  assert.equal(adhesiveFor(one('x2', '60X120')), null);
  assert.equal(adhesiveFor(one('x2', '30X120')), null);
});

test('клей: чего нет в таблицах, тому рекомендации нет — 120×120, слэбы, мозаика, декор, другая марка, упаковка', () => {
  for (const f of ['120X120', '120X278', '20X80', '15X15', '7.5X30', '50X120', '30X80']) assert.equal(adhesiveFor(one('italon', f)), null, f);
  assert.equal(adhesiveFor(products.find(p => /^МОЗАИКА 30X30/.test(p.format))), null);
  assert.equal(adhesiveFor(products.find(p => p.format === 'ВСТАВКА 60X120')), null);
  assert.equal(adhesiveFor(one('coliseum', '60X120')), null);
  assert.equal(adhesiveFor(products.find(p => p.collectionId === 'packaging')), null);
  assert.equal(adhesiveFor(null), null); assert.equal(adhesiveFor({ section: 'italon', format: '' }), null);
  const n = products.filter(p => adhesiveFor(p)).length;
  assert.equal(n, 477, `с рекомендацией клея ${n}`);
});

test('клей: таблица для карточки — основания, грунтовки, клеи для дерева и металла, быстрые клеи для улицы', () => {
  const inside = adhesiveTable('interior'), floor = adhesiveTable('exteriorFloor'), wall = adhesiveTable('exteriorWall');
  assert.equal(inside.bases.length, 10); assert.ok(inside.bases.includes('Полы с подогревом') && inside.bases.includes('Гипсокартон'));
  assert.equal(adhesiveLabel(inside.otherBases.adhesives), 'Keralastic T (R2T)');   // Ultrabond Eco PU 2K в прайсе нет
  assert.match(inside.notes.join(' '), /Primer G.*Eco Prim T/);
  assert.deepEqual(floor.quick, []);   // Granirapid и Quick-клеев в прайсе нет assert.equal(floor.otherBases, null);
  assert.deepEqual(wall.bases, ['Штукатурки на цементной основе', 'Бетон', 'Гидроизоляция серии Mapelastic']);
});
