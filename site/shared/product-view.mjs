// Страница товара: подписи и характеристики позиции. Общие для сборки (site/pages/product.mjs)
// и браузера (site/js/pages/product.mjs — живое переключение вариантов отделки без перезагрузки),
// поэтому статический HTML и HTML после переключения совпадают. Только данные прайса, без домыслов.
import { esc, fmt, lower, money, number, plural } from './format.mjs';

const cap = s => s ? s[0].toLocaleUpperCase('ru-RU') + s.slice(1) : '';
const dec = s => String(s).replace(/(\d)\.(\d)/g, '$1,$2');

/** Отделка из прайса: «ЛЮКС И РЕТТИФИЦИРОВАННАЯ» → { surface: 'люкс', rectified: true } */
export function finishInfo(p) {
  const parts = String(p.finish || '').split(/\s+И\s+/).map(lower).filter(Boolean);
  return { surface: parts.filter(x => !x.startsWith('реттиф')).join(' и '), rectified: parts.some(x => x.startsWith('реттиф')) };
}
/** Подпись варианта отделки: «Люкс», «Натуральный» */
export const surfaceLabel = p => cap(finishInfo(p).surface) || '—';

/** Формат: «80 × 160 см», «Мозаика 31,5 × 29,7 см» */
export function formatLabel(p) {
  const f = String(p.format || '');
  if (!f) return '';
  const m = f.match(/^([^\d]*?)\s*(\d[\d.]*\s*[XХ]\s*[\d.]+)$/);
  if (!m) return cap(lower(f));
  return `${m[1] ? `${cap(lower(m[1]))} ` : ''}${dec(fmt(m[2]))} см`;
}

/** Цена одной единицы: { value: '6 249,00 ₽', unit: 'м²' } или null */
export const priceParts = p => p.priceKopecks > 0 ? { value: money(p.priceKopecks), unit: p.unit } : null;

/** Количество в минимальном заказе (в единицах цены) и его стоимость. */
export function minimumOrder(p) {
  if (!p.canOrder || !p.unitMilliPerPack) return null;
  const milli = p.minPacks * p.unitMilliPerPack;
  return { packs: p.minPacks, quantity: milli / 1000, totalKopecks: Math.round(p.priceKopecks * milli / 1000) };
}

/** «1 паллета · 21 кор. · 53,76 м²» */
export function minimumLabel(p) {
  const m = minimumOrder(p);
  const parts = [lower(p.minimum)];
  if (m && p.boxed && m.packs > 1) parts.push(`${number(m.packs)} ${p.orderUnit}`);
  if (m && p.unit === 'м²') parts.push(`${number(m.quantity)} м²`);
  else if (m && p.boxed) parts.push(`${number(m.quantity)} шт`);
  return parts.join(' · ');
}

/** Коробок на паллете, если в прайсе получается целое число. */
function packsPerPallet(p) {
  if (!p.palletArea || !p.areaPerPack) return null;
  const n = p.palletArea / p.areaPerPack;
  return Math.abs(n - Math.round(n)) < 1e-6 ? Math.round(n) : null;
}

/**
 * Характеристики: { tile: [[подпись, значение]…], pack: [[…]…] } — только то, что есть в прайсе.
 * Толщина известна только для X2 (20 мм — по названию линии).
 */
export function productSpecs(p, { collectionLabel = '', categoryLabel = '' } = {}) {
  const f = finishInfo(p);
  const tile = [
    ['Артикул', p.code],
    collectionLabel && ['Коллекция', collectionLabel],
    categoryLabel && ['Тип', categoryLabel],
    p.format && ['Формат', formatLabel(p)],
    f.surface && ['Поверхность', cap(f.surface)],
    f.rectified && ['Кромка', 'Ректифицированная'],
    p.section === 'x2' && ['Толщина', '20 мм'],
    ['Линия', p.section === 'x2' ? 'X2 — для улицы' : 'Italon — для интерьера'],
  ].filter(Boolean);
  const perPallet = packsPerPallet(p);
  const pack = p.collectionId === 'packaging' ? [['Продажа', 'Поштучно']] : [
    ['Цена за', p.unit === 'м²' ? 'м²' : 'штуку'],
    p.boxed ? ['Продажа', 'Коробками'] : ['Продажа', 'Поштучно'],
    p.boxed && p.areaPerPack && ['Площадь в коробке', `${number(p.areaPerPack)} м²`],
    !p.boxed && p.areaPerPack && p.unit === 'м²' && ['Площадь одной плиты', `${number(p.areaPerPack)} м²`],
    p.boxed && p.piecesPerPack && ['Штук в коробке', number(p.piecesPerPack)],
    ['Минимальный заказ', minimumLabel(p)],
    p.palletArea && ['Паллета', `${number(p.palletArea)} м²${perPallet && p.boxed ? ` · ${number(perPallet)} ${p.orderUnit}` : ''}`],
  ].filter(Boolean);
  return { tile, pack };
}

export const specsHtml = rows => rows.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join('');

/** Строка под ценой: минимальный заказ и его стоимость. */
export function minimumNote(p) {
  const m = minimumOrder(p);
  if (!m) return 'Количество уточняется';
  return `Минимальный заказ: ${minimumLabel(p)}${p.priceKopecks > 0 ? ` — ${money(m.totalKopecks)}` : ''}`;
}

/** Тема письма о консультации. */
export const consultSubject = p => `Консультация: ${p.name}, арт. ${p.code}`;
export const consultBody = p => `Здравствуйте! Интересует позиция ${p.name}, артикул ${p.code}${p.format ? `, ${formatLabel(p).replace(/ /g, ' ')}` : ''}. `;

export const variantsCount = n => `${n} ${plural(n, ['вариант', 'варианта', 'вариантов'])} отделки`;
