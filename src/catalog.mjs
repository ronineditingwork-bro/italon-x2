import raw from '../data/italon-price-2026-07.json' with { type: 'json' };
import images from '../data/product-images.json' with { type: 'json' };
import groutRows from '../data/italon-grouts-2025.json' with { type: 'json' };
import { groutData, groutByColor } from './grouts.mjs';
import mapeiPrice from '../data/mapei-price.json' with { type: 'json' };
import features from '../data/picker-features.json' with { type: 'json' };
import { unpack, fromBase64 } from '../site/shared/picker-features.mjs';
import { createPricing, MAX_PACKS } from './pricing.mjs';

export const priceInfo = { source: raw.source, validFrom: raw.validFrom, currency: 'RUB', vatIncluded: true };
export const sections = [
  { id: 'italon', label: 'Italon', available: true },
  { id: 'x2', label: 'X2', available: true },
  { id: 'coliseum', label: 'Coliseum', available: true },
  { id: 'contract', label: 'Контракт', available: true },
];
const SECTION_BY_LINE = { X2: 'x2', 'Italon Coliseum': 'coliseum', 'Italon Контракт': 'contract' };
const unique = new Map();
const roundUp = n => Math.ceil(n - 1e-9);
for (const series of raw.series) for (const row of series.items) {
  if (unique.has(row.code)) {
    const previous = unique.get(row.code);
    if (previous.priceKopecks !== Math.round(row.price * 100) || previous.name !== row.name)
      throw new Error(`Conflicting price rows for ${row.code}`);
    continue;
  }
  const unit = row.unit === 'Кв.м' ? 'м²' : 'шт';
  const boxed = row.boxonly === true;
  const unitsPerPack = unit === 'м²' ? row.box : (boxed ? row.pcs : 1);
  // Продаём не только паллетами: в прайсе у многих позиций стоит «1 паллета», но минимальный заказ у нас — 1 коробка.
  const pieceMinimum = Number(row.min.match(/^(\d+)\s*ШТ/i)?.[1] || 0); // явный минимум в штуках («2 ШТ») — как в прайсе
  const minPacks = pieceMinimum ? Math.max(1, roundUp(pieceMinimum / (unitsPerPack || 1))) : 1;
  const canOrder = Number.isFinite(unitsPerPack) && unitsPerPack > 0;
  const crate = row.code === '450080000001';
  const slab = row.fmt === '120X278' && !crate;   // слэб: «коробка» в прайсе — один лист 120×278, продаём и считаем листами
  const minimum = slab ? '1 лист' : /паллета/i.test(row.min) ? '1 коробка' : (row.min || '1 шт');
  unique.set(row.code, {
    code: row.code, name: row.name, latin: row.latin,
    section: SECTION_BY_LINE[series.line] || 'italon',
    collectionId: crate ? 'packaging' : series.slug,
    collection: crate ? 'Упаковка' : series.series,
    format: crate ? '' : row.fmt, finish: crate ? '' : row.finish,
    unit, priceKopecks: Math.round(row.price * 100), boxed,
    orderUnit: slab ? 'лист' : boxed ? 'кор.' : 'шт', unitsPerPack: unitsPerPack || null,
    unitMilliPerPack: Math.round((unitsPerPack || 0) * 1000),
    piecesPerPack: boxed ? row.pcs : 1, areaPerPack: crate ? null : row.box,
    palletArea: crate ? null : row.pallet, minPacks,
    minimum, canOrder,
    image: crate ? images.products[row.code] || null : images.products[row.code] || images.collections[series.slug] || null,
  });
}
export const products = [...unique.values()];
// рекомендуемая затирка — в самом товаре: её видят и страницы сайта, и корзина, и КП, и заявка менеджеру.
// Нет рекомендации Italon (Прима, Coliseum, мозаика без своей строки) — для КП подбираем Ultracolor Plus из прайса по цвету фото плитки (by: 'color').
const priceCodes = Object.values(mapeiPrice.items).map(x => (/ULTRACOLOR PLUS (\d{3})\b/.exec(x.name) || [])[1]).filter(Boolean);
for (const p of products) {
  if (p.collectionId === 'packaging') continue;
  const g = groutData(p, groutRows);
  if (g) { p.grout = g; continue; }
  const f = p.image?.kind === 'sku' && features.items[p.image.src.replace(/^\//, '')];
  const code = f && groutByColor(unpack(fromBase64(f.f)).mean, priceCodes);
  const m = /^(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)$/.exec(p.format || '');
  if (code) p.grout = { mapei: [code], by: 'color', ...(m ? { size: [m[1] * 10, m[2] * 10] } : {}), thickness: p.section === 'x2' ? 20 : p.format === '120X278' ? 6 : 9 };
}
export const productMap = new Map(products.map(p => [p.code, p]));
export { MAX_PACKS };
export const { lineFor, calculateCart, calculateArea } = createPricing(productMap, priceInfo);
