// Данные для сборки страниц (Node, этап сборки). Всё берётся из data/*.json через src/*.
// Ничего не выдумываем: только то, что есть в прайсе и в описании салона.
import { products, priceInfo } from '../src/catalog.mjs';
import { collections as rawCollections, layingMethods, outdoorSpaces } from '../src/scenes.mjs';

const plateFormat = f => /^\d+(\.\d+)?X\d+(\.\d+)?$/.test(f);
const area = f => f.split('X').reduce((a, b) => a * Number(b), 1);
const titleCase = s => s.split('-').map(w => w === 'x2' ? 'X2' : w[0].toUpperCase() + w.slice(1)).join(' ');

/** Латинское имя коллекции из идентификатора: charme-deluxe → «Charme Deluxe», x2-aura → «Aura X2». */
export function latinName(id) {
  return id.startsWith('x2-') ? titleCase(id.slice(3)) + ' X2' : titleCase(id);
}

export const collections = rawCollections.map((c, index) => {
  const items = products.filter(p => p.collectionId === c.id);
  const formats = [...new Set(items.map(p => p.format).filter(Boolean))]
    .sort((a, b) => (plateFormat(b) - plateFormat(a)) || (plateFormat(a) ? area(b) - area(a) : a.localeCompare(b, 'ru', { numeric: true })));
  const finishParts = items.flatMap(p => p.finish.split(/\s+И\s+/)).filter(Boolean).map(f => f.toLocaleLowerCase('ru-RU'));
  // «реттифицированная» в прайсе — это кромка, а не поверхность: выносим отдельно
  const finishes = [...new Set(finishParts.filter(f => !f.startsWith('реттиф')).map(f => f.replace(/ая$/, 'ый')))];
  const rectified = finishParts.some(f => f.startsWith('реттиф'));
  const prices = items.filter(p => p.unit === 'м²').map(p => p.priceKopecks);
  return { ...c, latin: latinName(c.id), formats, plateFormats: formats.filter(plateFormat), finishes, rectified,
    minPriceKopecks: prices.length ? Math.min(...prices) : null, items, index };
});
export const italonCollections = collections.filter(c => c.section === 'italon');
export const x2Collections = collections.filter(c => c.section === 'x2');

const allPlateFormats = [...new Set(products.map(p => p.format).filter(plateFormat))];
export const stats = {
  total: products.length,
  italon: products.filter(p => p.section === 'italon').length,
  x2: products.filter(p => p.section === 'x2').length,
  collections: collections.length,
  italonCollections: italonCollections.length,
  x2Collections: x2Collections.length,
  plateFormats: allPlateFormats.length,
  largestFormat: allPlateFormats.sort((a, b) => area(b) - area(a))[0],
};

export const salon = {
  name: 'Italon Experience',
  city: 'Краснодар',
  street: 'ул. Бабушкина, 248',
  address: 'Краснодар, ул. Бабушкина, 248',
  hours: [['Пн — Пт', '10:00 — 19:00'], ['Сб — Вс', '10:00 — 18:00']],
  phone: '+7 918 24 89 248',
  phoneHref: 'tel:+79182489248',
  email: 'italon@amanagroup.org',
  parking: 'Парковка есть',
  maps: {
    yandex: 'https://yandex.ru/maps/?rtext=~%D0%9A%D1%80%D0%B0%D1%81%D0%BD%D0%BE%D0%B4%D0%B0%D1%80%2C%20%D1%83%D0%BB%D0%B8%D1%86%D0%B0%20%D0%91%D0%B0%D0%B1%D1%83%D1%88%D0%BA%D0%B8%D0%BD%D0%B0%2C%20248&rtt=auto',
    twoGis: 'https://2gis.ru/search/%D0%9A%D1%80%D0%B0%D1%81%D0%BD%D0%BE%D0%B4%D0%B0%D1%80%2C%20%D1%83%D0%BB%D0%B8%D1%86%D0%B0%20%D0%91%D0%B0%D0%B1%D1%83%D1%88%D0%BA%D0%B8%D0%BD%D0%B0%2C%20248',
    google: 'https://www.google.com/maps/dir/?api=1&destination=%D0%9A%D1%80%D0%B0%D1%81%D0%BD%D0%BE%D0%B4%D0%B0%D1%80%2C%20%D1%83%D0%BB%D0%B8%D1%86%D0%B0%20%D0%91%D0%B0%D0%B1%D1%83%D1%88%D0%BA%D0%B8%D0%BD%D0%B0%2C%20248',
    widget: 'https://yandex.ru/map-widget/v1/?text=%D0%9A%D1%80%D0%B0%D1%81%D0%BD%D0%BE%D0%B4%D0%B0%D1%80%2C%20%D1%83%D0%BB%D0%B8%D1%86%D0%B0%20%D0%91%D0%B0%D0%B1%D1%83%D1%88%D0%BA%D0%B8%D0%BD%D0%B0%2C%20248&z=17',
  },
};
export const priceNote = 'Цены по прайсу от 01.07.2026, склад Краснодар, с НДС';

/** Основная навигация (шапка по центру, мобильное меню, подвал). */
export const nav = [
  { path: '/collections/', label: 'Коллекции' },
  { path: '/x2/', label: 'X2 · улица' },
  { path: '/catalog/', label: 'Каталог' },
  { path: '/calculator/', label: 'Калькулятор' },
  { path: '/inspiration/', label: 'Вдохновение' },
  { path: '/salon/', label: 'Салон' },
];

/** Категория позиции по формату из прайса: plate | mosaic | decor | packaging. */
export const categories = [
  { id: 'plate', label: 'Керамогранит и плитка' },
  { id: 'mosaic', label: 'Мозаика' },
  { id: 'decor', label: 'Декор, бордюры, вставки' },
  { id: 'packaging', label: 'Упаковка' },
];
export function categoryOf(p) {
  if (p.collectionId === 'packaging') return 'packaging';
  if (/^МОЗАИКА/.test(p.format)) return 'mosaic';
  if (/^[А-ЯЁ]/.test(p.format)) return 'decor';
  return 'plate';
}

/**
 * Варианты отделки: позиции одной коллекции, одного формата и цвета, различающиеся отделкой
 * (например, «… 80X160 ЛЮКС» и «… 80X160 РЕТ»). Ключ — название без формата и маркеров отделки.
 * Эвристика по названиям прайса; этап B может уточнить.
 */
const FINISH_TOKENS = /^(ЛЮКС|РЕТ|НАТ|ПАТ|СТР|ШЛИФ|СИЛК|ГЛ|МАТ|ЛАП|Х2|X2|\d+(\.\d+)?([XХ]\d+(\.\d+)?)?)$/;
export function variantKey(p) {
  const base = p.name.split(/\s+/).filter(t => !FINISH_TOKENS.test(t)).join(' ');
  return `${p.collectionId}|${p.format}|${base}`;
}
export const variantGroups = new Map();
for (const p of products) {
  const key = variantKey(p);
  if (!variantGroups.has(key)) variantGroups.set(key, []);
  variantGroups.get(key).push(p);
}
/** Варианты отделки для позиции: по одной позиции на каждую отделку (текущая — первой). */
export function variantsOf(p) {
  const byFinish = new Map([[p.finish, p]]);
  for (const other of variantGroups.get(variantKey(p)) || []) if (!byFinish.has(other.finish)) byFinish.set(other.finish, other);
  return [...byFinish.values()];
}
export { products, priceInfo, layingMethods, outdoorSpaces };
