// Рекомендации затирки Mapei / Litokol для товаров Italon (каталог производителя, декабрь 2025) и расчёт расхода.
// Данные: data/italon-grouts-2025.json (строка = позиция каталога затирок, пишет scripts/import-grouts.py) и data/grout-colors.json.
// Привязка к товару — по коллекции и ВСЕМ словам названия позиции; латинские названия товаров сокращены («CHA.ADV.PLA.WHITE»),
// поэтому сокращение сравнивается по началу слова. У мозаик, декоров и вставок свои строки и часто другой цвет, поэтому
// товар получает рекомендацию, только если в его названии не осталось «лишних» значимых слов. Спорное — без рекомендации.
// Модуль чистый (без fs): формула расхода нужна и в браузере.
import colors from '../data/grout-colors.json' with { type: 'json' };

/** Слова названия товара, которые не отличают позицию каталога затирок: отделка, кромка, серия декора. */
export const NOISE = new Set(['RET', 'RETT', 'LUX', 'NAT', 'PAT', 'GRIP', 'STR', 'STRUTT', 'SQ', 'CER', 'LAP', 'MM', 'X', 'SILK', 'RT', 'MAT', 'NATURAL', 'PLAY']);

// MINIBRICK = Mini Brick; декор «TATAMI» в каталоге затирок записан как «Mosaico Tatami», «MOSAICO HEXAGON COLD» — как «Hexagon Cold»
const words = s => String(s || '').toUpperCase().replace(/MINIBRICK/g, 'MINI BRICK').replace(/MOSAICO (?=HEXAGON (COLD|WARM))/g, '')
  .replace(/(?<!MOS\w*[ .])TATAMI/g, 'MOSAICO TATAMI').split(/[^A-Z]+/).filter(Boolean);
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** a — слово товара, возможно сокращённое: «PLA» ~ «PLATINUM», «B.» ~ «BIANCO», «CREM» ~ «CREMO». */
const same = (a, b) => a === b || b.startsWith(a) || (b.length >= 3 && a.startsWith(b));

/** Слова товара без названия коллекции в начале («CHA.ADV.», «AVA.», «FORUM»). */
function productWords(product, collection) {
  const w = words(product.latin), col = words(collection);
  let i = 0; for (const c of col) if (w[i] && same(w[i], c)) i++;
  return w.slice(i);
}

/** Число слов позиции, если строка подходит товару: каждое слово позиции нашлось среди слов товара, остаток — только шум. Иначе null. */
function fit(row, pw) {
  const left = [...pw], want = words(row.article_en);
  for (const a of want) {
    const k = left.findIndex(p => same(p, a));
    if (k < 0) return null;
    left.splice(k, 1);
  }
  return left.every(p => NOISE.has(p)) ? want.length : null;
}

/** Строка рекомендации для товара или null. Коллекции X2 и Contract («x2-magma», «contract-nova») берут строки базовой коллекции. */
export function groutFor(product, rows) {
  const id = String(product.collectionId || '').replace(/^(x2|contract)-/, '');
  let best = null, n = 0, tie = false;
  for (const row of rows) {
    if (slug(row.collection) !== id) continue;
    const k = fit(row, productWords(product, row.collection));
    if (k == null) continue;
    if (k > n) { best = row; n = k; tie = false; } else if (k === n && (row.mapei !== best.mapei || row.litokol !== best.litokol)) tie = true;
  }
  return tie ? null : best;
}

/**
 * Данные затирки для товара (хранятся в товаре как product.grout): { mapei: ['111'] | ['123', '111'], litokol?: 'LLE.105', size?: [a, b] мм, thickness мм } или null.
 * size есть только у плитки (формат «60X120»): у мозаики на сетке в прайсе размер листа, а не чипа — расход по нему не посчитать.
 */
export function groutData(product, rows) {
  const row = groutFor(product, rows);
  if (!row) return null;
  const mapei = [row.mapei, row.mapei2].filter(Boolean);
  if (!mapei.length || mapei.some(c => !colors.mapei[c])) return null;
  const m = /^(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)$/.exec(product.format || '');
  return { mapei,
    // check_litokol — аналог Litokol спорный или без названия (ТЗ, раздел 8): показываем только Mapei, пока производитель не подтвердит
    ...(row.litokol && !row.check_litokol && colors.litokol[row.litokol] ? { litokol: row.litokol } : {}),
    ...(m ? { size: [m[1] * 10, m[2] * 10] } : {}),
    // толщины в прайсе нет: типовые значения Italon; менеджер уточняет при заказе
    thickness: product.section === 'x2' ? 20 : product.format === '120X278' ? 6 : 9 };
}

/** Цвет по коду: { code, name, hex }. */
export const groutColor = (brand, code) => ({ code, ...colors[brand][code] });
/** «Mapei 111 «Серебристо-серый» (аналог Litokol LLE.105 «Серебристо-серый»)»; два цвета Mapei — через «или». */
export function groutLabel(g) {
  const name = (brand, title, code) => `${title} ${code} «${colors[brand][code].name}»`;
  return g.mapei.map(c => name('mapei', 'Mapei', c)).join(' или ') + (g.litokol ? ` (аналог ${name('litokol', 'Litokol', g.litokol)})` : '');
}

/** Ширина шва, на которую считается затирка в корзине и КП; менеджер корректирует по проекту. */
export const QUOTE_JOINT_MM = 2;
/**
 * Рекомендуемая затирка к корзине: строки сгруппированы по цвету, расход суммируется по плитке, проданной в м².
 * lines — строки корзины ({ product, quantity }). → [{ label, kg | null, names: [названия плитки] }]; kg = null — расход не посчитать (мозаика, штучный товар).
 */
export function groutSummary(lines, joint = QUOTE_JOINT_MM) {
  const out = new Map();
  for (const l of lines || []) {
    const g = l.product?.grout;
    if (!g) continue;
    const label = groutLabel(g), item = out.get(label) || { label, kg: 0, names: [] };
    const perM2 = g.size && l.product.unit === 'м²' ? groutKgPerM2(g.size[0], g.size[1], g.thickness, joint) : NaN;
    item.kg = item.kg == null || Number.isNaN(perM2) ? null : item.kg + perM2 * l.quantity;
    item.names.push(l.product.name); out.set(label, item);
  }
  return [...out.values()].map(x => ({ ...x, kg: x.kg == null ? null : Math.ceil(x.kg * 10) / 10 }));
}

/** Плотность цементной затирки для формулы расхода, кг/дм³ (коэффициент из таблиц расхода Mapei Ultracolor Plus). */
export const GROUT_DENSITY = 1.6;
/**
 * Расход затирки, кг/м²: (A + B) / (A × B) × C × D × плотность — стандартная формула производителей затирок.
 * a, b — стороны плитки, мм; thickness — толщина плитки (глубина шва), мм; joint — ширина шва, мм. Некорректный ввод → NaN.
 */
export function groutKgPerM2(a, b, thickness, joint) {
  const v = [a, b, thickness, joint].map(Number);
  return v.every(x => Number.isFinite(x) && x > 0) ? (v[0] + v[1]) / (v[0] * v[1]) * v[2] * v[3] * GROUT_DENSITY : NaN;
}
