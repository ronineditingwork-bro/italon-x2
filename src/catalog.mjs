import raw from '../data/italon-price-2026-07.json' with { type: 'json' };
import images from '../data/product-images.json' with { type: 'json' };

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
  const palletMinimum = /паллета/i.test(row.min);
  const pieceMinimum = Number(row.min.match(/^(\d+)\s*ШТ/i)?.[1] || 1);
  const minPacks = palletMinimum && row.box > 0 && row.pallet > 0
    ? roundUp(row.pallet / row.box)
    : Math.max(1, roundUp(pieceMinimum / (unitsPerPack || 1)));
  const canOrder = Number.isFinite(unitsPerPack) && unitsPerPack > 0 &&
    (!palletMinimum || (row.box > 0 && row.pallet > 0));
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
    minimum: row.min || '1 шт', canOrder,
    image: crate ? null : images.products[row.code] || images.collections[series.slug] || null,
  });
}
export const products = [...unique.values()];
export const productMap = new Map(products.map(p => [p.code, p]));
export const MAX_PACKS = 9999;
export function lineFor(code, packs) {
  const product = productMap.get(code);
  if (!product || !product.canOrder) throw new Error('Материал недоступен для расчёта.');
  if (!Number.isSafeInteger(packs) || packs < product.minPacks || packs > MAX_PACKS)
    throw new Error(`Количество для ${code}: от ${product.minPacks} до ${MAX_PACKS} ${product.orderUnit}`);
  const quantityMilli = packs * product.unitMilliPerPack;
  const totalKopecks = Math.round(product.priceKopecks * quantityMilli / 1000);
  return { code, packs, product, quantity: quantityMilli / 1000, totalKopecks,
    area: product.areaPerPack ? Math.round(packs * product.areaPerPack * 1000) / 1000 : null,
    pieces: product.piecesPerPack ? packs * product.piecesPerPack : null };
}
export function calculateCart(items) {
  if (!Array.isArray(items) || items.length > 150) throw new Error('В корзине может быть до 150 позиций.');
  const seen = new Set();
  const lines = items.map(item => {
    if (!item || typeof item.code !== 'string' || seen.has(item.code)) throw new Error('Некорректная позиция корзины.');
    seen.add(item.code);
    return lineFor(item.code, item.packs);
  });
  return { lines, totalKopecks: lines.reduce((sum, l) => sum + l.totalKopecks, 0), priceInfo };
}
export function calculateArea(code, area, reserve = 10) {
  const p = productMap.get(code);
  if (!p || p.unit !== 'м²' || !p.canOrder) throw new Error('Выберите плитку с ценой за м².');
  if (!Number.isFinite(area) || area <= 0 || area > 100000 || ![0, 5, 10, 15, 20].includes(reserve))
    throw new Error('Укажите площадь от 0 до 100 000 м² и допустимый запас.');
  const target = area * (100 + reserve) / 100;
  const packsBeforeMinimum = roundUp(target / p.unitsPerPack);
  const packs = Math.max(p.minPacks, packsBeforeMinimum);
  return { ...lineFor(code, packs), areaRequested: area, reserve, target, minimumApplied: packs > packsBeforeMinimum };
}
