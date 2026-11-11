// Затирка и клей Mapei к плитке из корзины — товары и цены из прайса поставщика (data/mapei-price.json, scripts/import-mapei.py).
// Только справочно: сумма считается отдельно от плитки (у Mapei свои скидки и условия) и в итог КП не входит.
// Рекомендуем только то, что есть в прайсе; из нескольких подходящих — то, что есть на складе Краснодар.
// Модуль чистый (без fs): им пользуются корзина в браузере, PDF КП и заявка менеджеру.
import price from '../data/mapei-price.json' with { type: 'json' };
import { groutKgPerM2, groutColor, QUOTE_JOINT_MM } from './grouts.mjs';
import { adhesiveFor, adhesiveBySize, plateSize } from './adhesives.mjs';

/** Показывать клиенту остаток склада Краснодар (на дату выгрузки прайса). */
export const SHOW_STOCK = true;
/** Расход клея по данным Mapei: 2–5 кг/м² в зависимости от плитки и способа нанесения, на идеальном основании. Мешки считаем по верхней границе. */
export const ADHESIVE_KG_M2 = [2, 5];
export const MAPEI_PRICE_DATE = price.date;

const items = Object.entries(price.items).map(([sku, x]) => ({ sku, ...x }));
const groutSku = new Map(items.map(x => [(/ULTRACOLOR PLUS (\d{3})\b/.exec(x.name) || [])[1], x]).filter(([code]) => code));
const GREY = /\b(GREY|GRIGIO)\b/, WHITE = /\b(WHITE|BIANCO)\b/;
/** Позиции прайса для клея по названию из таблиц Italon: «Keraflex Maxi S1» → серый и белый мешок. «Keraflex» без серии не совпадёт с «Keraflex Maxi S1». */
function adhesiveItems(name) {
  const key = `MAPEI ${name.toUpperCase()} `;
  return items.filter(x => x.name.toUpperCase().startsWith(key) && (GREY.test(x.name.slice(key.length, key.length + 7)) || WHITE.test(x.name.slice(key.length, key.length + 7))));
}
/** Есть ли клей в прайсе — рекомендации без этого не показываются (adhesives.mjs). */
export const inPrice = name => adhesiveItems(name).length > 0;

const pickInStock = list => list.find(x => x.stock > 0) || list[0] || null;
const card = (x, extra) => ({ sku: x.sku, image: x.image || null, price: x.price, stock: x.stock, packKg: x.kg, ...extra });

/** Мозаика на сетке: в прайсе размер листа, а не чипа — затирку считаем по типовому чипу 5×5 см (расход выше, чем у плитки). */
export const MOSAIC_CHIP_MM = 50;

/**
 * Затирка и клей к корзине — полный расчёт сопутствующих материалов. lines — строки корзины ({ product, quantity }).
 * Источник подбора (by): 'italon' — рекомендация Italon; 'color' — затирка по цвету плитки; 'format' — клей по ближайшему формату таблицы Italon;
 * 'mosaic' — клей для мозаики. → { grout, adhesive, noGrout, noAdhesive, totalRub, date }
 * Карточка: { sku, title, image, price, stock, packKg, packs | null, kg | [от, до] | null, for: [названия плитки], alt, by: [источники] }.
 */
export function mapeiMaterials(lines) {
  const grout = new Map(), adhesive = new Map(), noGrout = [], noAdhesive = [];
  const add = (map, x, init, name, by, step) => {
    const c = map.get(x.sku) || card(x, { ...init, for: [], by: [] });
    step(c); c.for.push(name); if (!c.by.includes(by)) c.by.push(by); map.set(x.sku, c);
  };
  for (const { product: p, quantity } of lines || []) {
    if (!p || p.collectionId === 'packaging') continue;
    const sqm = p.unit === 'м²', plate = plateSize(p), g = p.grout;
    // затирка: из альтернативных цветов Mapei — тот, что есть в прайсе и на складе
    const options = (g?.mapei || []).map(code => ({ code, x: groutSku.get(code) })).filter(o => o.x);
    const o = options.find(o => o.x.stock > 0) || options[0];
    if (o) {
      const [a, b] = g.size || (sqm ? [MOSAIC_CHIP_MM, MOSAIC_CHIP_MM] : []);
      const perM2 = a && sqm ? groutKgPerM2(a, b, g.thickness, QUOTE_JOINT_MM) : NaN;
      add(grout, o.x, { title: `Ultracolor Plus ${o.code} «${groutColor('mapei', o.code).name}», ${o.x.kg} кг`, kg: 0, alt: options.filter(a => a !== o).map(a => a.code) },
        p.name, g.by || 'italon', c => { c.kg = c.kg == null || Number.isNaN(perM2) ? null : c.kg + perM2 * quantity; });
    } else noGrout.push(p.name);
    // клей: таблица Italon → ближайший формат таблицы → клей для мозаики
    const exact = adhesiveFor(p), byFormat = !exact && plate ? adhesiveBySize(plate, p.section === 'x2') : null;
    const list = exact ? exact.rows[exact.use] : byFormat || (!plate && sqm ? [{ name: 'Adesilex P10' }] : null);
    // в порядке таблицы; у каждого клея из серого и белого мешка берём тот, которого больше на складе
    const x = list && pickInStock(list.filter(r => !r.name.includes('+')).flatMap(r => adhesiveItems(r.name).sort((i, j) => j.stock - i.stock).slice(0, 1).map(i => ({ ...i, label: r.name }))));
    if (x) add(adhesive, x, { title: `${x.label}, ${GREY.test(x.name) ? 'серый' : 'белый'}, ${x.kg} кг`, area: 0 }, p.name,
      exact ? 'italon' : byFormat ? 'format' : 'mosaic', c => { c.area = c.area == null || !sqm ? null : c.area + quantity; });
    else noAdhesive.push(p.name);
  }
  const groutCards = [...grout.values()].map(c => ({ ...c, kg: c.kg == null ? null : Math.ceil(c.kg * 10) / 10,
    packs: c.kg == null ? null : Math.max(1, Math.ceil(c.kg / c.packKg)) }));
  const adhesiveCards = [...adhesive.values()].map(({ area, ...c }) => ({ ...c, area,
    kg: area == null ? null : ADHESIVE_KG_M2.map(k => Math.ceil(k * area)), packs: area == null ? null : Math.max(1, Math.ceil(ADHESIVE_KG_M2[1] * area / c.packKg)) }));
  const totalRub = [...groutCards, ...adhesiveCards].reduce((s, c) => s + (c.packs || 0) * c.price, 0);
  return { grout: groutCards, adhesive: adhesiveCards, noGrout, noAdhesive, totalRub, date: price.date };
}

/** Пометка к карточке: откуда подбор, если не по рекомендации Italon. */
export const BY_NOTE = { color: 'по цвету плитки', format: 'по формату плитки', mosaic: 'для мозаики' };
export const byNote = c => c.by.filter(b => BY_NOTE[b]).map(b => BY_NOTE[b]).join(', ');
