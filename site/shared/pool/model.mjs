// Бассейн Lab: чистые данные и расчёт (общие для сборки, браузера и тестов).
// Материалы — только из каталога: чаша — керамогранит Italon 60×120, терраса и бортик — X2 20 мм 60×120.
import { colorOf, collectionLabel, packsFor } from '../outdoor/materials.mjs';
import { media, money, normalize } from '../format.mjs';

// shortcut: три тестовые коллекции; новые добавлять после проверки текстуры на сценах
export const LAB_COLLECTIONS = ['magma', 'avantgarde', 'millennium'];
export const ZONES = [
  { id: 'deck', zone: 1, label: 'Терраса', line: 'x2', note: 'X2 · 20 мм' },
  { id: 'bowl', zone: 2, label: 'Чаша', line: 'italon', note: 'Керамогранит Italon' },
  { id: 'coping', zone: 3, label: 'Бортик', line: 'x2', note: 'X2 · 20 мм' },
];
export const POOL_TYPES = { skimmer: 'Скиммерный', overflow: 'Переливной' };
export const LIGHTS = [{ id: 'day', label: 'День' }, { id: 'dusk', label: 'Вечер' }];
export const LAYOUTS = [{ id: 'straight', label: 'Прямая', hint: 'Швы в одну линию.' }, { id: 'offset', label: 'Со смещением', hint: 'Каждый ряд сдвинут на половину плиты.' }];
export const GROUT = [
  { id: 'light', label: 'Светлая', rgb: [0.78, 0.76, 0.72] },
  { id: 'grey', label: 'Серая', rgb: [0.42, 0.42, 0.41] },
  { id: 'dark', label: 'Графит', rgb: [0.12, 0.12, 0.12] },
];
export const COPING_WIDTH = 0.3;
export const WASTE = 0.1;

const FORMAT = '60X120';
/**
 * Варианты для зон из каталога. Текстура — оригинал ARCHITALON того же цвета той же коллекции (натуральная поверхность),
 * если он есть в originals (data/lab-originals.json): рисунок камня совпадает, у маленьких фото каталога его не видно.
 */
export function buildOptions(products, { root = './', originals = {} } = {}) {
  const scan = new Map();
  for (const p of products) {
    const o = originals[p.code];
    if (o?.file && p.section === 'italon' && /НАТУРАЛЬН/i.test(p.finish || '')) scan.set(`${p.collectionId}~${normalize(colorOf(p))}`, o);
  }
  const option = (p, base) => {
    const o = scan.get(`${base}~${normalize(colorOf(p))}`);
    return {
      code: p.code, name: `${collectionLabel(p.collection)} ${colorOf(p)}`.trim(), color: colorOf(p), collection: collectionLabel(p.collection), collectionId: base,
      format: p.format, image: media(root, p.image.src), imgW: p.image.width, imgH: p.image.height,
      texture: o ? { src: media(root, `media/lab/${o.file}`), mobile: o.mobile?.file ? media(root, `media/lab/${o.mobile.file}`) : null } : null,
      priceKopecks: p.priceKopecks || 0, unit: p.unit || 'м²', areaPerPack: p.areaPerPack || 0, minPacks: p.minPacks || 1, orderUnit: p.orderUnit || 'кор.',
      priceText: p.priceKopecks > 0 ? `${money(p.priceKopecks)} за ${p.unit || 'м²'}` : '',
    };
  };
  const pick = line => {
    const seen = new Set(), out = [];
    for (const base of LAB_COLLECTIONS) for (const p of products) {
      const id = line === 'x2' ? `x2-${base}` : base;
      if (p.collectionId !== id || p.format !== FORMAT || !p.image?.src || p.canOrder === false || !(p.areaPerPack > 0)) continue;
      const key = `${base}~${normalize(colorOf(p))}`; if (seen.has(key)) continue;
      seen.add(key); out.push(option(p, base));
    }
    return out;
  };
  return { x2: pick('x2'), italon: pick('italon') };
}
export const optionsFor = (options, zoneId) => options[ZONES.find(z => z.id === zoneId).line];

/** Начальный выбор: светлая терраса и бортик, серая чаша. */
export function defaults(scenes, options) {
  const first = Object.keys(scenes)[0], find = (list, color) => (list.find(o => /Айс/.test(o.color) && color === 'ice') || list.find(o => /Сильвер/.test(o.color) && color === 'silver') || list[0]).code;
  return { scene: first, light: 'day', layout: 'straight', grout: 'grey', zone: 'deck',
    deck: find(options.x2, 'ice'), coping: find(options.x2, 'ice'), bowl: find(options.italon, 'silver'),
    ...dims(scenes[first]), deckArea: 60 };
}
export const dims = scene => ({ length: scene.pool.length, width: scene.pool.width, depth: scene.pool.depth });
const NUMBERS = { length: [2, 50], width: [1.5, 25], depth: [0.4, 3], deckArea: [0, 2000] };

/** Ссылка на вариант: только перечисленные значения; всё неизвестное или вне диапазона — по умолчанию. */
export function parseHash(hash, scenes, options) {
  const q = new URLSearchParams(String(hash || '').replace(/^#/, '')), s = defaults(scenes, options);
  if (Object.hasOwn(scenes, q.get('scene') || '') && !scenes[q.get('scene')].eveningOf) Object.assign(s, { scene: q.get('scene') }, dims(scenes[q.get('scene')]));
  for (const [key, list] of [['light', LIGHTS], ['layout', LAYOUTS], ['grout', GROUT], ['zone', ZONES]]) if (list.some(x => x.id === q.get(key))) s[key] = q.get(key);
  for (const z of ZONES) if (optionsFor(options, z.id).some(o => o.code === q.get(z.id))) s[z.id] = q.get(z.id);
  for (const [key, [lo, hi]] of Object.entries(NUMBERS)) { const v = Number(q.get(key)); if (q.has(key) && Number.isFinite(v) && v >= lo && v <= hi) s[key] = v; }
  return s;
}
export const toHash = s => new URLSearchParams(['scene', 'light', 'zone', 'deck', 'bowl', 'coping', 'layout', 'grout', 'length', 'width', 'depth', 'deckArea'].map(k => [k, String(s[k])])).toString();

/** Зоны, которые есть на сцене (бортик — только там, где он выделен отдельно). */
export const zonesOf = scene => ZONES.filter(z => scene.zones.includes(z.zone));

/** Площади, м²: чаша — дно и стены прямоугольника (ступени покрывает запас), бортик — полоса 30 см по периметру. */
export function areasOf(s, scene) {
  const bowl = s.length * s.width + 2 * (s.length + s.width) * s.depth;
  const coping = scene.zones.includes(3) ? 2 * (s.length + s.width) * COPING_WIDTH + 4 * COPING_WIDTH ** 2 : 0;
  const r = v => Math.round(v * 100) / 100;
  return { deck: r(s.deckArea), bowl: r(bowl), coping: r(coping) };
}
/** Строки расчёта: один артикул на двух зонах складывается до округления до упаковок. */
export function estimate(s, scene, options) {
  const areas = areasOf(s, scene), byCode = new Map();
  for (const z of zonesOf(scene)) {
    if (!(areas[z.id] > 0)) continue;
    const opt = optionsFor(options, z.id).find(o => o.code === s[z.id]); if (!opt) continue;
    const e = byCode.get(opt.code) || { option: opt, zones: [], area: 0 };
    e.zones.push(z.label); e.area += areas[z.id]; byCode.set(opt.code, e);
  }
  const lines = [...byCode.values()].map(e => ({ ...e, ...packsFor(e.area, e.option, { waste: WASTE }) }));
  return { areas, lines, packs: lines.reduce((a, l) => a + l.packs, 0), totalKopecks: lines.reduce((a, l) => a + (l.costKopecks || 0), 0) };
}
