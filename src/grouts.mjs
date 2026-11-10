// Рекомендации затирки Mapei / Litokol для товаров Italon (каталог производителя, декабрь 2025) и расчёт расхода.
// Данные: data/italon-grouts-2025.json (строка = позиция каталога затирок, пишет scripts/import-grouts.py) и data/grout-colors.json.
// Привязка к товару — по коллекции и ВСЕМ словам названия позиции; латинские названия товаров сокращены («CHA.ADV.PLA.WHITE»),
// поэтому сокращение сравнивается по началу слова. У мозаик, декоров и вставок свои строки и часто другой цвет, поэтому
// товар получает рекомендацию, только если в его названии не осталось «лишних» значимых слов. Спорное — без рекомендации.
// Модуль чистый (без fs): формула расхода нужна и в браузере.

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

/** Блок для карточки: { mapei: [{ code, name, hex }, …], litokol: { code, name, hex } | null } или null. */
export function groutView(row, colors) {
  if (!row) return null;
  const item = (brand, code) => { const c = colors[brand]?.[code]; return c ? { code, name: c.name, hex: c.hex } : null; };
  const mapei = [row.mapei, row.mapei2].filter(Boolean).map(c => item('mapei', c));
  if (!mapei.length || mapei.some(m => !m)) return null;
  // check_litokol — аналог Litokol спорный или без названия (ТЗ, раздел 8): показываем только Mapei, пока производитель не подтвердит
  return { mapei, litokol: row.litokol && !row.check_litokol ? item('litokol', row.litokol) : null };
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
