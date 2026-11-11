// Рекомендации клея Mapei для плит Italon: три таблицы из статьи Italon и MAPEI «Плитка Italon. Выбираем клей правильно» (15.09.2021).
// Данные: data/italon-adhesives-2021.json — таблицы переписаны как есть (номинальный размер в мм → клеи и класс по EN 12004).
// Клей подбирается по формату плитки. Чего в таблицах нет, того не показываем: нет строки для размера — нет рекомендации
// (120×120, слэбы 120×278 в интерьере, мозаика, декоры, X2 толщиной 20 мм в форматах, которых нет в таблице).
// Показываются только клеи из прайса Mapei (src/mapei.mjs); количество, цены и склад к корзине — там же.
// Модуль чистый (без fs): им пользуются страницы сайта, корзина в браузере, КП и заявка менеджеру.
import data from '../data/italon-adhesives-2021.json' with { type: 'json' };
import { inPrice } from './mapei.mjs';

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
    // только клеи из прайса Mapei: остальные сняты с поставки (Ultralite S1, Granirapid и др.)
    const list = row ? row.adhesives.filter(([name]) => inPrice(name.split(' + ')[0])).map(([name, c]) => ({ name, class: cls(c) })) : [];
    return [id, list.length ? list : null];
  }));
  return rows[use] ? { use, size, rows } : null;
}

/**
 * Клей для КП, когда точной строки в таблицах Italon нет (Coliseum, 120×120, слэбы, нестандартные размеры):
 * строка того же размера без учёта толщины, иначе — ближайшая по площади плиты не меньше нашей, иначе — самая крупная
 * (чем крупнее плита, тем эластичнее клей: 120×120 и слэбы получают клей самых крупных плит таблицы). Только клеи из прайса; [{ name, class }] или null.
 */
export function adhesiveBySize([a, b], x2) {
  const fits = s => (s.t === X2_THICKNESS) === x2, area = r => Math.max(...r.parsed.filter(fits).map(s => s.a * s.b));
  const rows = TABLES[x2 ? 'exteriorFloor' : 'interior'].rows.filter(r => r.parsed.some(fits)).sort((p, q) => area(p) - area(q));
  const row = rows.find(r => r.parsed.some(s => s.a === a && s.b === b)) || rows.find(r => area(r) >= a * b) || rows.at(-1);
  const list = row ? row.adhesives.filter(([name]) => inPrice(name.split(' + ')[0])).map(([name, c]) => ({ name, class: cls(c) })) : [];
  return list.length ? list : null;
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
  const sold = other ? other.adhesives.filter(([name]) => inPrice(name)) : [];
  return { bases: t.bases, notes: t.notes, quick: (t.quick || []).filter(inPrice),
    otherBases: sold.length ? { bases: other.bases, adhesives: sold.map(([name, c]) => ({ name, class: cls(c) })) } : null };
}
