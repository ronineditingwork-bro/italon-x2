// Витрина лаборатории — 8 эффектных материалов для быстрого старта. Это ТОЛЬКО список артикулов и ручные поправки блеска/рельефа;
// названия, фото, цены и ссылки берутся из каталога сайта (data/catalog.json), второго каталога здесь нет.
// surf — ХУДОЖЕСТВЕННЫЕ параметры света (не измерения): rough — шероховатость блеска (0 — зеркало, 1 — матовая), relief — условная высота рельефа (см),
// micro — мелкое зерно, f0 — отражение при взгляде «в лоб». Для остальных позиций каталога они считаются по типу отделки (catalog.mjs → surfaceFor).
export const FEATURED = [
  { code: '610010003167', tagline: 'Светлый мрамор с прожилками', surf: { rough: 0.36, relief: 0.03, micro: 0.10, f0: 0.05 } },        // Ривьера Уайт
  { code: '610010002765', tagline: 'Тёмный рельефный камень', surf: { rough: 0.56, relief: 0.06, micro: 0.12, f0: 0.04 } },           // Вояджер Блэк
  { code: '610010002799', tagline: 'Тёплая глина, матовая', surf: { rough: 0.72, relief: 0.05, micro: 0.20, f0: 0.035 } },           // Крета Клэй
  { code: '610010002696', tagline: 'Бронзовый мрамор с жилами', surf: { rough: 0.30, relief: 0.03, micro: 0.10, f0: 0.05 } },        // Фьямма Бронз
  { code: '610010001319', tagline: 'Холодный сланцево-синий камень', surf: { rough: 0.62, relief: 0.07, micro: 0.18, f0: 0.04 } },  // Эверстоун Лава
  { code: '610010002735', tagline: 'Тёплый камень мелкой фактуры', surf: { rough: 0.60, relief: 0.05, micro: 0.14, f0: 0.04 } },     // Дискавер Дезерт
  { code: '610010002664', tagline: 'Коричневый мрамор', surf: { rough: 0.36, relief: 0.03, micro: 0.10, f0: 0.05 } },               // Да Винчи Браун
  { code: '610010002667', tagline: 'Тёмный бетонный камень', surf: { rough: 0.62, relief: 0.05, micro: 0.14, f0: 0.04 } },           // Экспо Дарк
];
export const FEATURED_CODES = FEATURED.map(f => f.code);
/** Витрина → записи лаборатории: entryOf(product) строит запись из позиции каталога; ручные параметры света накладываются сверху. Бросает ошибку, если позиции нет в каталоге. */
export function featuredEntries(products, entryOf) {
  const byCode = new Map(products.map(p => [p.code, p]));
  return FEATURED.map(f => {
    const p = byCode.get(f.code); if (!p) throw new Error(`Лаборатория: в каталоге нет позиции ${f.code}`);
    const e = entryOf(p); if (!e.eligible) throw new Error(`Лаборатория: ${f.code} не пригодна (${e.reason})`);
    return { ...e, tagline: f.tagline, surf: e.quality === 'hd' ? f.surf : e.surf, featured: true };
  });
}
