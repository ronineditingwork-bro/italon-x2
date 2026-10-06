import raw from '../data/italon-price-2026-07.json' with { type: 'json' };
import images from '../data/product-images.json' with { type: 'json' };
import { createPricing, MAX_PACKS } from './pricing.mjs';

export const priceInfo = { source: raw.source, validFrom: raw.validFrom, currency: 'RUB', vatIncluded: true };
export const sections = [
  { id: 'italon', label: 'Italon', available: true },
  { id: 'x2', label: 'X2', available: true },
  { id: 'coliseum', label: 'Coliseum', available: false },
];
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
  const minimum = /паллета/i.test(row.min) ? '1 коробка' : (row.min || '1 шт');
  const crate = row.code === '450080000001';
  unique.set(row.code, {
    code: row.code, name: row.name, latin: row.latin,
    section: series.line === 'X2' ? 'x2' : 'italon',
    collectionId: crate ? 'packaging' : series.slug,
    collection: crate ? 'Упаковка' : series.series,
    format: crate ? '' : row.fmt, finish: crate ? '' : row.finish,
    unit, priceKopecks: Math.round(row.price * 100), boxed,
    orderUnit: boxed ? 'кор.' : 'шт', unitsPerPack: unitsPerPack || null,
    unitMilliPerPack: Math.round((unitsPerPack || 0) * 1000),
    piecesPerPack: boxed ? row.pcs : 1, areaPerPack: crate ? null : row.box,
    palletArea: crate ? null : row.pallet, minPacks,
    minimum, canOrder,
    image: crate ? images.products[row.code] || null : images.products[row.code] || images.collections[series.slug] || null,
  });
}
export const products = [...unique.values()];
export const productMap = new Map(products.map(p => [p.code, p]));
export { MAX_PACKS };
export const { lineFor, calculateCart, calculateArea } = createPricing(productMap, priceInfo);
