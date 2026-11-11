// Затирка и клей Mapei к корзине (src/mapei.mjs, data/mapei-price.json): только товары из прайса, количество, цены, склад, свой итог.
import test from 'node:test';
import assert from 'node:assert/strict';
import price from '../data/mapei-price.json' with { type: 'json' };
import { mapeiMaterials, inPrice, ADHESIVE_KG_M2 } from '../src/mapei.mjs';
import { groutKgPerM2 } from '../src/grouts.mjs';
import { products } from '../src/catalog.mjs';

const byLatin = l => products.find(p => p.latin === l) || assert.fail('нет товара ' + l);
const line = (l, quantity) => ({ product: byLatin(l), quantity });

test('Mapei: в прайсе 40 затирок Ultracolor Plus и клеи; у каждой позиции цена, склад, вес и фото', () => {
  const list = Object.values(price.items);
  assert.equal(list.filter(x => /ULTRACOLOR PLUS/.test(x.name)).length, 40);
  assert.ok(list.every(x => x.price > 0 && Number.isInteger(x.stock) && x.kg > 0 && x.image), 'неполная позиция');
  assert.ok(inPrice('Keraflex Maxi S1') && inPrice('Ultralite S2') && !inPrice('Keraflex') && !inPrice('Ultralite S1') && !inPrice('Granirapid'));
});

test('Mapei: затирка — упаковки по 2 кг по расходу на шов 2 мм, одинаковый цвет складывается; мозаика без количества', () => {
  const a = byLatin('AVA.PURE 120X120 RET'), b = byLatin('AVA.PURE 120X278');
  const m = mapeiMaterials([{ product: a, quantity: 20 }, { product: b, quantity: 10 }, line('AVA.PURE MINIBRICK', 3)]);
  const g111 = m.grout.find(c => c.sku === '6011102A');
  assert.deepEqual(g111.for, [a.name, b.name]);
  const kg = groutKgPerM2(1200, 1200, 9, 2) * 20 + groutKgPerM2(1200, 2780, 6, 2) * 10;
  assert.equal(g111.kg, Math.ceil(kg * 10) / 10); assert.equal(g111.packs, Math.ceil(g111.kg / 2)); assert.equal(g111.price, 959);
  const mos = m.grout.find(c => c.for.includes(byLatin('AVA.PURE MINIBRICK').name));
  assert.equal(mos.kg, null); assert.equal(mos.packs, null);
});

test('Mapei: два цвета Mapei — берётся тот, что есть в прайсе и на складе, второй — как альтернатива', () => {
  const [c] = mapeiMaterials([line('MET.ROYAL IVORY 80X160', 10)]).grout;
  assert.match(c.title, /^Ultracolor Plus 123 /); assert.deepEqual(c.alt, ['111']);
});

test('Mapei: клей — из таблицы Italon и прайса, мешки по верхней границе расхода 5 кг/м², диапазон 2–5 кг/м²', () => {
  const tile = products.find(p => p.section === 'italon' && p.format === '60X120' && p.canOrder && p.collectionId !== 'prima' && p.grout && !p.grout.by);
  const [c] = mapeiMaterials([{ product: tile, quantity: 14.4 }]).adhesive;
  assert.match(c.title, /^Keraflex (Extra|Maxi) S1, (серый|белый), 25 кг$/); assert.deepEqual(c.by, ['italon']);
  assert.deepEqual(c.kg, ADHESIVE_KG_M2.map(k => Math.ceil(k * 14.4)));
  assert.equal(c.packs, Math.ceil(5 * 14.4 / 25));
});

test('Mapei: полный расчёт к любой плитке — КП 20261111-5D2089 (Прима, Coliseum, мозаика): затирка к каждой позиции, клей ко всей площади', () => {
  const cart = [['610010003526', 5.76], ['610110001511', 2.97], ['610010001531', 8.64], ['610110001486', 2.97], ['610010001538', 34.56]]
    .map(([code, quantity]) => ({ product: products.find(p => p.code === code), quantity }));
  const m = mapeiMaterials(cart);
  assert.deepEqual([m.noGrout, m.noAdhesive], [[], []]);
  assert.equal(m.grout.flatMap(c => c.for).length, 5, 'затирка к каждой позиции');
  assert.ok(m.grout.every(c => c.by.includes('color') && c.packs >= 1), 'рекомендации Italon нет — подбор по цвету, количество посчитано (мозаика — по чипу 5×5 см)');
  const s1 = m.adhesive.find(c => /^Keraflex (Extra|Maxi) S1/.test(c.title));
  assert.equal(s1.for.length, 3); assert.equal(Math.round(s1.area * 100), Math.round((5.76 + 8.64 + 34.56) * 100));   // все три плиты 60×120
  assert.equal(s1.packs, Math.ceil(5 * 48.96 / 25));
  assert.match(m.adhesive.find(c => c.by.includes('mosaic')).title, /^Adesilex P10, белый, 25 кг$/);
});

test('Mapei: 120×120 и слэбы — клей по ближайшему формату таблицы Italon (самый эластичный ряд)', () => {
  const m = mapeiMaterials([line('AVA.PURE 120X120 RET', 20), line('AVA.PURE 120X278', 10)]);
  assert.deepEqual(m.noAdhesive, []);
  assert.ok(m.adhesive.every(c => c.by.includes('format') && /^Ultr(alite|aflex) S2/.test(c.title)), m.adhesive.map(c => c.title).join('; '));
});

test('Mapei: товары без рекомендаций и пустая корзина — ничего не добавляют', () => {
  const pack = products.find(p => p.collectionId === 'packaging');
  assert.deepEqual(mapeiMaterials([{ product: pack, quantity: 1 }]).grout, []);
  const empty = mapeiMaterials([]);
  assert.deepEqual([empty.grout, empty.adhesive, empty.noAdhesive, empty.totalRub], [[], [], [], 0]);
});
