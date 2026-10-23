// Каталог лаборатории: единственный источник данных — существующий каталог сайта (data/catalog.json) и признаки подбора (data/picker.json).
// Здесь нет второго списка товаров: модуль только решает, какие позиции подходят для лаборатории, насколько качественно их можно показать,
// как их искать и фильтровать. Новые коллекции и более качественные фото попадают в лабораторию сами, как только появляются в каталоге.
import { normalize, titleRu, money, fmt, media } from '../format.mjs';
import { COLORS } from '../picker-text.mjs';

/** Порог «полной симуляции» — меньшая сторона фото, пикселей. Всё меньше показывается в упрощённом режиме без дорисовки деталей. */
export const HD_MIN_SIDE = 700;
/** Позиции, которые лаборатория не берёт: мозаика, декор, упаковка (у них нет «лица» плитки для укладки). */
const NOT_A_TILE = /МОЗАИКА|ДЕКОР|ВСТАВКА|БОРДЮР|ПЛИНТУС|ФРИЗ|СТРИП|ЯЩИК|ПАЛЛЕТ/i;

export const parseFormat = format => { const m = String(format || '').toUpperCase().replace(/Х/g, 'X').match(/^(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)$/); return m ? [Number(m[1]), Number(m[2])] : null; };

/** Пригодна ли позиция для лаборатории и в каком качестве. Чистая функция от записи каталога. */
export function labAsset(p) {
  const img = p?.image, photo = parseFormat(p?.format);
  if (!img?.src || !img.width || !img.height) return { eligible: false, reason: 'нет фотографии' };
  if (p.category && p.category !== 'plate') return { eligible: false, reason: 'мозаика, декор и аксессуары не входят в лабораторию' };
  if (NOT_A_TILE.test(`${p.format} ${p.name}`)) return { eligible: false, reason: 'не плитка для укладки' };
  if (!photo) return { eligible: false, reason: 'неизвестный формат' };
  const side = Math.min(img.width, img.height), quality = side >= HD_MIN_SIDE ? 'hd' : 'lite';
  const pxPerCm = img.width / photo[0];
  return { eligible: true, quality, photo, side, pxPerCm, maxPpcm: quality === 'hd' ? 40 : Math.max(3.5, Math.min(40, pxPerCm * 2.5)) };
}

/** «ПРИ.ДЕНИМ РЭД 120X278 ЛЮКС» → читаемое имя без размера; «РИВЬЕРА УАЙТ 60 РЕТ» → «Ривьера Уайт». */
export function cleanName(name) {
  return String(name || '').replace(/\s+\d+(?:[.,]\d+)?\s*(?:X|Х)\s*\d+(?:[.,]\d+)?(?=\s|$)/gi, '').replace(/\s+\d+\s*РЕ[TТ](?=\s|$)/gi, '').replace(/\s+(ЛЮКС|СИЛК|РЕ[TТ])$/i, '')
    .trim().toLocaleLowerCase('ru-RU').replace(/(^|[\s.-])\S/gu, c => c.toLocaleUpperCase('ru-RU')).replace(/\bx2\b/gi, 'X2');
}

/** Художественные параметры света по типу отделки (не измерения): rough — шероховатость блеска, relief — условная высота рельефа (см), micro — мелкое зерно, f0 — отражение «в лоб». */
export function surfaceFor(p, quality = 'hd') {
  const f = String(p?.finish || '').toUpperCase();
  let rough = 0.55, f0 = 0.04, relief = 0.04, micro = 0.12;
  if (/ЛЮКС|ПОЛИРОВАН/.test(f)) { rough = 0.14; f0 = 0.06; relief = 0.015; micro = 0.05; }
  else if (/ШЛИФОВАН/.test(f)) { rough = 0.34; f0 = 0.05; relief = 0.02; micro = 0.08; }
  else if (/СИЛК|САТИН|ЛАППАТ/.test(f)) { rough = 0.28; f0 = 0.05; relief = 0.025; micro = 0.08; }
  else if (/ПАТИНИР/.test(f)) { rough = 0.5; relief = 0.05; micro = 0.14; }
  else if (/ГРИП|ПРОТИВОСКОЛЬЗ/.test(f)) { rough = 0.8; relief = 0.09; micro = 0.22; f0 = 0.035; }
  else if (/СТРУКТУР|РЕЛЬЕФ/.test(f)) { rough = 0.7; relief = 0.08; micro = 0.2; f0 = 0.035; }
  else if (/МАТОВ/.test(f)) { rough = 0.66; relief = 0.04; micro = 0.12; }
  if (quality !== 'hd') return { rough, relief: 0, micro: 0, f0 };    // упрощённый режим: рельеф и зерно не придумываем
  return { rough, relief, micro, f0 };
}

/** Запись каталога → запись лаборатории. root — путь к корню сайта, imageUrl — подмена адреса фото (для автономного показа). */
export function toEntry(p, { root = './', imageUrl } = {}) {
  const a = labAsset(p);
  const url = imageUrl ? imageUrl(p) : (p.image?.src ? media(root, p.image.src) : null);
  return {
    code: p.code, name: cleanName(p.name), rawName: p.name, latin: p.latin || '', collection: titleRu(p.collection), collectionId: p.collectionId || '', format: fmt(p.format), formatKey: String(p.format || ''),
    finish: String(p.finish || '').toLowerCase(), priceText: p.priceKopecks > 0 ? `${money(p.priceKopecks)} за ${p.unit || 'м²'}` : '', canOrder: p.canOrder !== false,
    path: `/product/${p.code}/`, href: `${root}product/${p.code}/`, image: url, imgW: p.image?.width || 0, imgH: p.image?.height || 0,
    eligible: a.eligible && !!url, quality: a.quality || null, photo: a.photo || null, maxPpcm: a.maxPpcm || 40, reason: a.eligible && !url ? 'фото доступно только на сайте' : a.reason || '',
    surf: surfaceFor(p, a.quality),
  };
}

// ------------------------------------------------------------------------------------------------ поиск
const tokens = q => normalize(q).replace(/[«»"'()]/g, ' ').split(/[^a-z0-9а-я.,×]+/i).filter(Boolean).map(t => t.replace(/,/g, '.'));
/** Индекс поиска по всему каталогу (всем позициям, а не только пригодным для лаборатории). */
export function buildIndex(products, entryOf) {
  return products.map(p => { const e = entryOf(p); return { e, code: p.code, name: normalize(`${p.name} ${e.name}`), latin: normalize(p.latin || ''), coll: normalize(`${p.collection} ${p.collectionId || ''}`), fmt: normalize(p.format || ''), hay: normalize(`${p.code} ${p.name} ${p.latin || ''} ${p.collection} ${p.format}`) }; });
}
/** Поиск по артикулу и названию: все слова запроса должны найтись; выше — точный и начальный артикул, начало слова в названии. */
export function search(index, query, { limit = 60 } = {}) {
  const ts = tokens(query); if (!ts.length) return [];
  const out = [];
  for (const it of index) {
    let score = 0, ok = true;
    for (const t of ts) {
      let s = 0;
      if (/^\d{3,}$/.test(t)) { if (it.code === t) s = 200; else if (it.code.startsWith(t)) s = 120; else if (it.code.includes(t)) s = 70; else if (it.hay.includes(t)) s = 20; }
      else if (it.name.split(/[\s.-]+/).some(w => w === t)) s = 60;
      else if (it.name.split(/[\s.-]+/).some(w => w.startsWith(t))) s = 45;
      else if (it.latin && it.latin.includes(t)) s = 30;
      else if (it.coll.includes(t)) s = 25;
      else if (it.fmt.includes(t)) s = 25;
      else if (it.hay.includes(t)) s = 15;
      if (!s) { ok = false; break; } score += s;
    }
    if (ok) out.push({ it, score: score + (it.e.eligible ? 3 : 0) + (it.e.quality === 'hd' ? 2 : 0) });
  }
  out.sort((a, b) => b.score - a.score || (b.it.e.eligible - a.it.e.eligible) || a.it.e.name.localeCompare(b.it.e.name, 'ru'));
  return out.slice(0, limit).map(x => x.it.e);
}

// ------------------------------------------------------------------------------------------------ фильтры: цвет и фактура берутся из признаков подбора
export const COLOR_FAMILIES = [
  { id: 'light', label: 'Светлые', keys: ['white', 'ivory', 'lightgray'], swatch: '#e7e3da' },
  { id: 'beige', label: 'Бежевые и песочные', keys: ['beige', 'sand', 'greige'], swatch: '#c9b79c' },
  { id: 'gray', label: 'Серые', keys: ['gray'], swatch: '#8d8b88' },
  { id: 'dark', label: 'Тёмные и чёрные', keys: ['darkgray', 'black'], swatch: '#2a2a2c' },
  { id: 'brown', label: 'Коричневые и мокко', keys: ['brown', 'taupe'], swatch: '#7a5a43' },
  { id: 'cool', label: 'Зелёные и синие', keys: ['green', 'olive', 'blue', 'teal'], swatch: '#5d7a7a' },
  { id: 'warm', label: 'Красные и золотые', keys: ['red', 'pink', 'yellow'], swatch: '#b4673f' },
];
export const LOOKS = [['marble', 'Мрамор'], ['stone', 'Камень'], ['concrete', 'Бетон'], ['wood', 'Дерево'], ['travertine', 'Травертин'], ['onyx', 'Оникс'], ['terrazzo', 'Терраццо'], ['metal', 'Металл'], ['plain', 'Однотонная'], ['pattern', 'Рисунок'], ['textile', 'Текстиль']];
/** attrs — результат attributesOf() из подбора: { L, C, h, looks }. Возвращает { color, look } (идентификаторы) или пустые значения. */
export function classify(attrs) {
  if (!attrs) return { color: '', look: '' };
  let best = '', bv = 0.12;
  for (const [k, c] of Object.entries(COLORS)) { const v = c.fit({ L: attrs.L, C: attrs.C, h: attrs.h }); if (v > bv) { bv = v; best = k; } }
  let fam = COLOR_FAMILIES.find(f => f.keys.includes(best))?.id;
  if (!fam) fam = attrs.L > 78 ? 'light' : attrs.L < 32 ? 'dark' : attrs.C > 12 ? 'beige' : 'gray';
  let look = '', lv = 0.3; for (const [k] of LOOKS) { const v = attrs.looks?.[k] || 0; if (v > lv) { lv = v; look = k; } }
  return { color: fam, look };
}
/** Фильтрация записей: filters = { color, look, collection, format, onlyEligible }; attrs — Map code → { color, look }. */
export function filterEntries(entries, filters = {}, attrs = new Map()) {
  return entries.filter(e => {
    if (filters.onlyEligible !== false && !e.eligible) return false;
    if (filters.collection && e.collectionId !== filters.collection) return false;
    if (filters.format && e.formatKey !== filters.format) return false;
    const a = attrs.get(e.code);
    if (filters.color && a?.color !== filters.color) return false;
    if (filters.look && a?.look !== filters.look) return false;
    return true;
  });
}
export function facetsOf(entries, attrs = new Map()) {
  const coll = new Map(), formats = new Map(), colors = new Map(), looks = new Map();
  for (const e of entries) {
    if (!e.eligible) continue;
    coll.set(e.collectionId, { id: e.collectionId, label: e.collection, n: (coll.get(e.collectionId)?.n || 0) + 1 });
    formats.set(e.formatKey, { id: e.formatKey, label: e.format, n: (formats.get(e.formatKey)?.n || 0) + 1 });
    const a = attrs.get(e.code); if (a?.color) colors.set(a.color, (colors.get(a.color) || 0) + 1); if (a?.look) looks.set(a.look, (looks.get(a.look) || 0) + 1);
  }
  const byLabel = (a, b) => a.label.localeCompare(b.label, 'ru');
  const area = id => { const f = parseFormat(id); return f ? f[0] * f[1] : 0; };
  return {
    collections: [...coll.values()].sort(byLabel), formats: [...formats.values()].sort((a, b) => area(a.id) - area(b.id)),
    colors: COLOR_FAMILIES.filter(f => colors.has(f.id)).map(f => ({ ...f, n: colors.get(f.id) })), looks: LOOKS.filter(([k]) => looks.has(k)).map(([id, label]) => ({ id, label, n: looks.get(id) })),
  };
}
/** Сортировка «Популярные»: сначала витрина лаборатории, потом полная симуляция, потом по названию. */
export function sortEntries(entries, how = 'popular', featuredCodes = []) {
  const rank = new Map(featuredCodes.map((c, i) => [c, i])), arr = [...entries];
  const byName = (a, b) => a.name.localeCompare(b.name, 'ru') || a.code.localeCompare(b.code);
  if (how === 'name') return arr.sort(byName);
  if (how === 'code') return arr.sort((a, b) => a.code.localeCompare(b.code));
  return arr.sort((a, b) => (rank.has(a.code) ? rank.get(a.code) : 999) - (rank.has(b.code) ? rank.get(b.code) : 999) || (a.quality === 'hd' ? 0 : 1) - (b.quality === 'hd' ? 0 : 1) || byName(a, b));
}
