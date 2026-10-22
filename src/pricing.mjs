// Чистые функции расчёта корзины и площади. Не зависят от источника данных:
// сервер передаёт productMap из src/catalog.mjs, браузер — из public/data/catalog.json.
export const MAX_PACKS = 9999;
const roundUp = n => Math.ceil(n - 1e-9);
export function createPricing(productMap, priceInfo) {
  function lineFor(code, packs) {
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
  function calculateCart(items) {
    if (!Array.isArray(items) || items.length > 150) throw new Error('В корзине может быть до 150 позиций.');
    const seen = new Set();
    const lines = items.map(item => {
      if (!item || typeof item.code !== 'string' || seen.has(item.code)) throw new Error('Некорректная позиция корзины.');
      seen.add(item.code);
      return lineFor(item.code, item.packs);
    });
    return { lines, totalKopecks: lines.reduce((sum, l) => sum + l.totalKopecks, 0), priceInfo };
  }
  function calculateArea(code, area, reserve = 10) {
    const p = productMap.get(code);
    if (!p || p.unit !== 'м²' || !p.canOrder) throw new Error('Выберите плитку с ценой за м².');
    if (!Number.isFinite(area) || area <= 0 || area > 100000 || ![0, 5, 10, 15, 20].includes(reserve))
      throw new Error('Укажите площадь от 0 до 100 000 м² и допустимый запас.');
    const target = area * (100 + reserve) / 100;
    const packsBeforeMinimum = roundUp(target / p.unitsPerPack);
    const packs = Math.max(p.minPacks, packsBeforeMinimum);
    return { ...lineFor(code, packs), areaRequested: area, reserve, target, minimumApplied: packs > packsBeforeMinimum };
  }
  return { lineFor, calculateCart, calculateArea };
}
