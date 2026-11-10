// Рекомендации клея Mapei для плит Italon: три таблицы из статьи Italon и MAPEI «Плитка Italon. Выбираем клей правильно» (15.09.2021).
// Данные: data/italon-adhesives-2021.json — таблицы переписаны как есть (номинальный размер в мм → клеи и класс по EN 12004).
// Клей подбирается по формату плитки. Чего в таблицах нет, того не показываем: нет строки для размера — нет рекомендации
// (120×120, слэбы 120×278 в интерьере, мозаика, декоры, X2 толщиной 20 мм в форматах, которых нет в таблице).
// Расхода и фасовки в источнике нет, поэтому количество клея не считается: его определяет менеджер по основанию и шпателю.
// Модуль чистый (без fs): им пользуются страницы сайта, корзина в браузере, КП и заявка менеджеру.
import data from '../data/italon-adhesives-2021.json' with { type: 'json' };

export const ADHESIVE_SOURCE = data.source;
/** Где укладывают: ключ таблицы → подпись. */
export const ADHESIVE_USES = {
  interior: { title: 'Внутри помещений: пол и стены', short: 'внутри помещений' },
  exteriorFloor: { title: 'На улице: пол', short: 'на улице, на пол' },
  exteriorWall: { title: 'На улице: стены', short: 'на улице, на стены' },
};
/** Разделы каталога с плитой Italon. Coliseum Gres — другая марка: таблицы Italon на неё не распространяем. */
const ITALON_SECTIONS = new Set(['italon', 'x2', 'contract']);
const PLATE = /^(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)$/;
const X2_THICKNESS = 20;

/** «600x300x9» или «750x250x8,5» → { a: 300, b: 600, t: 9 } (стороны по возрастанию, мм). */
function parseSize(text) {
  const m = /^(\d+)x(\d+)x(\d+(?:,\d+)?)$/.exec(text);
  if (!m) throw new Error(`Клей: непонятный размер «${text}»`);
  const [x, y] = [Number(m[1]), Number(m[2])].sort((p, q) => p - q);
  return { a: x, b: y, t: Number(m[3].replace(',', '.')) };
}
const TABLES = Object.fromEntries(Object.entries(data.tables).map(([id, t]) => [id, { ...t, rows: t.rows.map(r => ({ ...r, parsed: r.sizes.map(parseSize) })) }]));
/** Класс как в стандарте: в источнике «C2 T» и «C1 T» напечатаны с пробелом. */
const cls = c => c.replace(/^([CR]\d) (?=[A-Z])/, '$1');

/** Стороны плиты в мм по формату каталога «60X120» (см) или null — мозаика, декор, упаковка. */
export function plateSize(product) {
  const m = PLATE.exec(product?.format || '');
  if (!m) return null;
  const [a, b] = [Math.round(m[1] * 10), Math.round(m[2] * 10)].sort((p, q) => p - q);
  return [a, b];
}

/** Строка таблицы для плиты a × b. У X2 (20 мм) подходит только строка с толщиной 20, у остальной плитки — строки обычной толщины. */
function rowFor(table, [a, b], x2) {
  return table.rows.find(r => r.parsed.some(s => s.a === a && s.b === b && (s.t === X2_THICKNESS) === x2)) || null;
}

/**
 * Рекомендация клея для товара или null.
 * → { use: 'interior' | 'exteriorFloor' — основное применение (X2 — улица, остальное — интерьер), size: [a, b] мм,
 *     rows: { interior, exteriorFloor, exteriorWall } — клеи [{ name, class }] по каждой таблице или null, если размера в ней нет }.
 * Нет строки для основного применения — рекомендации нет вовсе.
 */
export function adhesiveFor(product) {
  if (!product || !ITALON_SECTIONS.has(product.section)) return null;
  const size = plateSize(product);
  if (!size) return null;
  const x2 = product.section === 'x2', use = x2 ? 'exteriorFloor' : 'interior';
  const rows = Object.fromEntries(Object.keys(TABLES).map(id => {
    const row = rowFor(TABLES[id], size, x2);
    return [id, row ? row.adhesives.map(([name, c]) => ({ name, class: cls(c) })) : null];
  }));
  return rows[use] ? { use, size, rows } : null;
}

/** «Keraflex Extra S1, Keraflex Maxi S1 или Ultralite S1 (C2TE S1)»; разные классы — у каждого клея свой: «Ultralite S2 (C2E S2), … или Ultraflex S2 (C2TE S2)». */
export function adhesiveLabel(list) {
  const same = list.every(x => x.class === list[0].class);
  const names = list.map(x => same ? x.name : `${x.name} (${x.class})`);
  const text = names.length > 1 ? `${names.slice(0, -1).join(', ')} или ${names.at(-1)}` : names[0];
  return same ? `${text} (${list[0].class})` : text;
}

/** Основания, для которых составлена таблица, и примечания к ней — для карточки товара. */
export function adhesiveTable(use) {
  const t = data.tables[use], other = t.otherBases;
  return { bases: t.bases, notes: t.notes, quick: t.quick || [],
    otherBases: other ? { bases: other.bases, adhesives: other.adhesives.map(([name, c]) => ({ name, class: cls(c) })) } : null };
}

/**
 * Рекомендуемый клей к корзине: строки сгруппированы по набору клеёв и месту укладки.
 * lines — строки корзины ({ product, quantity }). → [{ label: 'Mapei …', use: 'внутри помещений' | 'на улице, на пол, при укладке на клей', area | null, names: [названия плитки], formats: ['60×120'] }].
 * area — площадь плитки, м² (сумма по строкам, проданным в м²); количество клея не считается — расхода в таблицах Italon нет.
 */
export function adhesiveSummary(lines) {
  const out = new Map();
  for (const l of lines || []) {
    const a = adhesiveFor(l.product);
    if (!a) continue;
    const label = `Mapei ${adhesiveLabel(a.rows[a.use])}`, key = `${a.use}|${label}`;
    // X2 кладут и без клея (трава, гравий, опоры), поэтому у него рекомендация с оговоркой
    const use = ADHESIVE_USES[a.use].short + (l.product.section === 'x2' ? ', при укладке на клей' : '');
    const item = out.get(key) || { label, use, area: 0, names: [], formats: [] };
    item.area = item.area == null || l.product.unit !== 'м²' ? null : item.area + l.quantity;
    item.names.push(l.product.name);
    const format = `${a.size[0] / 10}×${a.size[1] / 10}`;
    if (!item.formats.includes(format)) item.formats.push(format);
    out.set(key, item);
  }
  return [...out.values()].map(x => ({ ...x, area: x.area == null ? null : Math.round(x.area * 1000) / 1000 }));
}
