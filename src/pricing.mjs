// Чистые функции расчёта корзины и площади. Не зависят от источника данных:
// сервер передаёт productMap из src/catalog.mjs, браузер — из public/data/catalog.json.
export const MAX_PACKS = 9999;
/** Слэбы 120×278 возят в транспортном ящике: до 18 листов в ящике. Ящик добавляется к корзине сам и считается по числу листов. */
export const SLAB_FORMAT = '120X278', CRATE_CODE = '450080000001', SLABS_PER_CRATE = 18;
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
    const sheets = lines.filter(l => l.product.format === SLAB_FORMAT).reduce((n, l) => n + l.packs * (l.product.piecesPerPack || 1), 0);
    const i = lines.findIndex(l => l.code === CRATE_CODE);
    if (sheets && productMap.get(CRATE_CODE)?.canOrder) {
      const crate = { ...lineFor(CRATE_CODE, Math.ceil(sheets / SLABS_PER_CRATE)), auto: true, sheets };
      if (i >= 0) lines[i] = crate; else lines.push(crate);
    }
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
