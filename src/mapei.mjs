// Затирка и клей Mapei к плитке из корзины — товары и цены из прайса поставщика (data/mapei-price.json, scripts/import-mapei.py).
// Только справочно: сумма считается отдельно от плитки (у Mapei свои скидки и условия) и в итог КП не входит.
// Рекомендуем только то, что есть в прайсе; из нескольких подходящих — то, что есть на складе Краснодар.
// Модуль чистый (без fs): им пользуются корзина в браузере, PDF КП и заявка менеджеру.
import price from '../data/mapei-price.json' with { type: 'json' };
import { groutKgPerM2, groutColor, QUOTE_JOINT_MM } from './grouts.mjs';
import { adhesiveFor } from './adhesives.mjs';

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

/**
 * Затирка и клей к корзине. lines — строки корзины ({ product, quantity }).
 * → { grout: [карточки], adhesive: [карточки], noAdhesive: [названия плитки], totalRub, date }
 * Карточка: { sku, title, image, price, stock, packKg, packs | null, kg | [от, до] | null, for: [названия плитки], alt }.
 */
export function mapeiMaterials(lines) {
  const grout = new Map(), adhesive = new Map(), noAdhesive = [];
  for (const { product: p, quantity } of lines || []) {
    if (!p) continue;
    const g = p.grout;
    if (g) {
      // из альтернативных цветов Mapei — тот, что есть в прайсе и на складе
      const options = g.mapei.map(code => ({ code, x: groutSku.get(code) })).filter(o => o.x);
      const o = options.find(o => o.x.stock > 0) || options[0];
      if (o) {
        const perM2 = g.size && p.unit === 'м²' ? groutKgPerM2(g.size[0], g.size[1], g.thickness, QUOTE_JOINT_MM) : NaN;
        const c = grout.get(o.x.sku) || card(o.x, { title: `Ultracolor Plus ${o.code} «${groutColor('mapei', o.code).name}», ${o.x.kg} кг`, kg: 0, for: [],
          alt: options.filter(a => a !== o).map(a => a.code) });
        c.kg = c.kg == null || Number.isNaN(perM2) ? null : c.kg + perM2 * quantity;
        c.for.push(p.name); grout.set(o.x.sku, c);
      }
    }
    const a = adhesiveFor(p);
    if (a) {
      // клеи — в порядке таблицы Italon; у каждого из серого и белого мешка берём тот, которого больше на складе
      const x = pickInStock(a.rows[a.use].filter(r => !r.name.includes('+')).flatMap(r => {
        const list = adhesiveItems(r.name).sort((i, j) => j.stock - i.stock); return list.slice(0, 1).map(i => ({ ...i, label: r.name }));
      }));
      if (x) {
        const c = adhesive.get(x.sku) || card(x, { title: `${x.label}, ${GREY.test(x.name) ? 'серый' : 'белый'}, ${x.kg} кг`, area: 0, for: [] });
        c.area = c.area == null || p.unit !== 'м²' ? null : c.area + quantity;
        c.for.push(p.name); adhesive.set(x.sku, c);
      } else noAdhesive.push(p.name);
    } else if (p.collectionId !== 'packaging') noAdhesive.push(p.name);   // мозаика, 120×120, слэбы, Coliseum — клей подберёт менеджер
  }
  const groutCards = [...grout.values()].map(c => ({ ...c, kg: c.kg == null ? null : Math.ceil(c.kg * 10) / 10,
    packs: c.kg == null ? null : Math.max(1, Math.ceil(c.kg / c.packKg)) }));
  const adhesiveCards = [...adhesive.values()].map(({ area, ...c }) => ({ ...c, area,
    kg: area == null ? null : ADHESIVE_KG_M2.map(k => Math.ceil(k * area)), packs: area == null ? null : Math.max(1, Math.ceil(ADHESIVE_KG_M2[1] * area / c.packKg)) }));
  const totalRub = [...groutCards, ...adhesiveCards].reduce((s, c) => s + (c.packs || 0) * c.price, 0);
  return { grout: groutCards, adhesive: adhesiveCards, noAdhesive, totalRub, date: price.date };
}
