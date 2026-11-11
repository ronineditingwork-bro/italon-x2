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

test('Mapei: клей — из таблицы Italon и прайса, мешки по верхней границе расхода 5 кг/м², диапазон 2–5 кг/м²; без правила — «подберёт менеджер»', () => {
  const tile = products.find(p => p.section === 'italon' && p.format === '60X120' && p.canOrder);
  const m = mapeiMaterials([{ product: tile, quantity: 14.4 }, line('AVA.PURE 120X120 RET', 20)]);
  assert.equal(m.adhesive.length, 1);
  const [c] = m.adhesive;
  assert.match(c.title, /^Keraflex (Extra|Maxi) S1, (серый|белый), 25 кг$/);
  assert.deepEqual(c.kg, ADHESIVE_KG_M2.map(k => Math.ceil(k * 14.4)));
  assert.equal(c.packs, Math.ceil(5 * 14.4 / 25));
  assert.deepEqual(m.noAdhesive, [byLatin('AVA.PURE 120X120 RET').name]);
  assert.equal(m.totalRub, [...m.grout, ...m.adhesive].reduce((s, x) => s + (x.packs || 0) * x.price, 0));
});

test('Mapei: товары без рекомендаций и пустая корзина — ничего не добавляют', () => {
  const pack = products.find(p => p.collectionId === 'packaging');
  assert.deepEqual(mapeiMaterials([{ product: pack, quantity: 1 }]).grout, []);
  const empty = mapeiMaterials([]);
  assert.deepEqual([empty.grout, empty.adhesive, empty.noAdhesive, empty.totalRub], [[], [], [], 0]);
});
