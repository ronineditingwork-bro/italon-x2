// Рекомендации затирки (src/grouts.mjs, data/italon-grouts-2025.json): привязка к товарам и расчёт расхода.
import test from 'node:test';
import assert from 'node:assert/strict';
import rows from '../data/italon-grouts-2025.json' with { type: 'json' };
import colors from '../data/grout-colors.json' with { type: 'json' };
import { groutFor, groutData, groutSummary, groutKgPerM2 } from '../src/grouts.mjs';
import { products, groutOf } from '../site/data.mjs';

const byLatin = l => products.find(p => p.latin === l) || assert.fail('нет товара ' + l);
const codes = l => { const g = groutOf(byLatin(l)); return g && [g.mapei.map(c => c.code).join('/'), g.litokol?.code || ''].join(' '); };

test('затирки: импортированы все 396 строк каталога 2025, у каждой есть цвет Mapei из палитры', () => {
  assert.equal(rows.length, 396);
  assert.ok(rows.every(r => colors.mapei[r.mapei] && (!r.mapei2 || colors.mapei[r.mapei2])));
});

test('затирки: базовая плитка, сокращённые названия и разные отделки получают цвет своей позиции', () => {
  assert.equal(codes('AVA.PURE 120X120 RET'), '111 LLE.105');
  assert.equal(codes('FORUM SLIM POLAR 120X278'), '103 LLE.200');
  assert.equal(codes('CHA.ADV.ALAB.WHITE 80X160LUX'), codes('CHA.ADV.ALAB.WHITE 80X160RET'));   // одна рекомендация на все отделки цвета
  assert.equal(codes('CHA.ADV.ALAB.WHITE 80X160LUX').split(' ')[0], '132');                     // в 2021 была смесь 103+132, в 2025 — 132
  assert.ok(codes('CHA.DEL.B.MICHEL.80X160 LUX'), '«B.MICHEL.» = Bianco Michelangelo');
});

test('затирки: у мозаики и декора — своя строка, а без своей строки рекомендации нет (цвет базовой плитки не подставляется)', () => {
  const mos = rows.find(r => r.collection === 'Avantgarde' && r.article_en === 'Pure Mini Brick'), base = rows.find(r => r.collection === 'Avantgarde' && r.article_en === 'Pure');
  assert.equal(groutFor(byLatin('AVA.PURE MINIBRICK'), rows), mos); assert.notEqual(mos, base);
  assert.equal(groutOf(byLatin('MET.CALACATTA GOLD MOSAICO')), null);
  assert.equal(groutOf(byLatin('CHA.EVO STATUARIO MOSAICO HEXAGON')), null);
});

test('затирки: Litokol скрыт, где его нет или он спорный; два альтернативных цвета Mapei выводятся оба', () => {
  const data = l => byLatin(l).grout;
  assert.equal(data('WON.LIFE ALMOND 80 RET').litokol, undefined);                    // в каталоге «X»
  assert.equal(data('WON.LIFE GRAPHITE 80 RET').litokol, undefined);                  // Mapei серый, Litokol бежевый — на проверке
  assert.deepEqual(data('MET.ROYAL IVORY 80X160').mapei, ['123', '111']);
  assert.equal(groutData({ collectionId: 'prima', latin: 'PRI.DENIM RED 120X278 LUX' }, rows), null);
});

test('затирки в корзине и КП: расход на шов 2 мм суммируется по цвету; мозаика — без количества; товары без рекомендации не попадают', () => {
  const a = byLatin('AVA.PURE 120X120 RET'), b = byLatin('AVA.PURE 120X278'), mos = byLatin('AVA.PURE MINIBRICK'), none = products.find(p => p.collectionId === 'prima');
  const sum = groutSummary([{ product: a, quantity: 20 }, { product: b, quantity: 10 }, { product: mos, quantity: 3 }, { product: none, quantity: 5 }]);
  assert.equal(sum.length, 2);
  assert.match(sum[0].label, /^Mapei 111 «Серебристо-серый» \(аналог Litokol LLE\.105/); assert.deepEqual(sum[0].names, [a.name, b.name]);
  const expected = groutKgPerM2(1200, 1200, 9, 2) * 20 + groutKgPerM2(1200, 2780, 6, 2) * 10;
  assert.equal(sum[0].kg, Math.ceil(expected * 10) / 10);
  assert.equal(sum[1].kg, null); assert.deepEqual(sum[1].names, [mos.name]);
  assert.deepEqual(groutSummary([{ product: none, quantity: 5 }]), []); assert.deepEqual(groutSummary([]), []);
  assert.match(groutSummary([{ product: byLatin('MET.ROYAL IVORY 80X160'), quantity: 1 }])[0].label, /Mapei 123 «Старый белый» или Mapei 111/);
});

test('затирки: рекомендация есть у большинства товаров коллекций из каталога, вне каталога её нет', () => {
  const n = products.filter(p => groutOf(p)).length;
  assert.ok(n >= 700, `с рекомендацией ${n}`);
  assert.equal(groutOf(products.find(p => p.collectionId === 'prima')), null);        // коллекции нет в каталоге затирок
  assert.ok(products.filter(p => p.section === 'coliseum').every(p => !groutOf(p)));
});

test('затирки: расход — формула производителей; мозаика без калькулятора; некорректный ввод не даёт числа', () => {
  assert.ok(Math.abs(groutKgPerM2(600, 1200, 9, 2) - 0.072) < 1e-9);                  // (600+1200)/(600·1200)·9·2·1,6
  assert.ok(groutKgPerM2(600, 600, 9, 3) > groutKgPerM2(600, 600, 9, 2));
  for (const bad of [[0, 600, 9, 2], [600, 600, 'abc', 2], [600, 600, 9, -1]]) assert.ok(Number.isNaN(groutKgPerM2(...bad)));
  assert.deepEqual(groutOf(byLatin('AVA.PURE 120X120 RET')).size, [1200, 1200]);
  assert.equal(groutOf(byLatin('FORUM SLIM POLAR 120X278')).thickness, 6);
  assert.equal(groutOf(byLatin('AVA.PURE MINIBRICK')).size, null);
});
