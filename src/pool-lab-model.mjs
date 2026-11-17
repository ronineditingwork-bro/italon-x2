import { products, calculateArea } from './catalog.mjs';

// shortcut: three test collections; add slugs here once their 60x120 textures are checked in the lab
export const LAB_COLLECTIONS = [
  { id: 'magma', label: 'Магма' },
  { id: 'avantgarde', label: 'Авангард' },
  { id: 'millennium', label: 'Миллениум' },
];
export const ZONES = [
  { id: 'deck', zone: 1, label: 'Терраса', note: 'X2 · 20 мм', x2: true },
  { id: 'bowl', zone: 2, label: 'Чаша', note: 'Керамогранит', x2: false },
  { id: 'coping', zone: 3, label: 'Бортик', note: 'X2 · 20 мм', x2: true, skimmerOnly: true },
];
export const POOL_TYPES = { skimmer: 'Скиммерный', overflow: 'Переливной' };
export const LIGHTS = { day: 'День', dusk: 'Вечер', night: 'Ночь' };
export const POOL_GLOW = {
  warm: { label: 'Тёплый белый', rgb: [1, 0.78, 0.55] }, cool: { label: 'Холодный белый', rgb: [0.85, 0.95, 1] },
  aqua: { label: 'Бирюза', rgb: [0.25, 1, 0.85] }, blue: { label: 'Синий', rgb: [0.15, 0.35, 1] },
  violet: { label: 'Фиолетовый', rgb: [0.65, 0.25, 1] }, off: { label: 'Выключена', rgb: [0, 0, 0] },
};
export const GROUT = { light: { label: 'Светлая', rgb: [0.78, 0.76, 0.72] }, grey: { label: 'Серая', rgb: [0.42, 0.42, 0.41] }, dark: { label: 'Графит', rgb: [0.12, 0.12, 0.12] } };
export const LAYOUTS = { straight: 'Прямая', offset: 'Со смещением ½' };

function optionsFor(x2) {
  const seen = new Set();
  return LAB_COLLECTIONS.flatMap(c => products.filter(p =>
    p.collectionId === (x2 ? `x2-${c.id}` : c.id) && p.format === '60X120' && p.image?.kind === 'sku' && p.canOrder &&
    !seen.has(p.name) && seen.add(p.name)).map(p => ({ ...p, labCollection: c.id })));
}
export const OPTIONS = { deck: optionsFor(true), bowl: optionsFor(false) };
OPTIONS.coping = OPTIONS.deck;

export const DEFAULT_STATE = {
  type: 'skimmer', light: 'day', glow: 'aqua', grout: 'grey', layout: 'straight',
  deck: OPTIONS.deck.find(p => /МАГМА АЙС/.test(p.name))?.code ?? OPTIONS.deck[0].code,
  bowl: OPTIONS.bowl.find(p => /МАГМА СИЛЬВЕР/.test(p.name))?.code ?? OPTIONS.bowl[0].code,
  coping: OPTIONS.deck.find(p => /МАГМА АЙС/.test(p.name))?.code ?? OPTIONS.deck[0].code,
  length: 8, width: 4, depth: 1.5, deckArea: 60, reserve: 10,
};
const NUMBERS = { length: [2, 50], width: [1.5, 25], depth: [0.4, 3], deckArea: [0, 2000] };

/** Parses a share link; anything unknown or out of range falls back to the default. */
export function parseState(hash) {
  const q = new URLSearchParams(String(hash).replace(/^#/, ''));
  const state = { ...DEFAULT_STATE };
  const pick = (key, allowed) => { if (q.has(key) && Object.hasOwn(allowed, q.get(key))) state[key] = q.get(key); };
  pick('type', POOL_TYPES); pick('light', LIGHTS); pick('glow', POOL_GLOW); pick('grout', GROUT); pick('layout', LAYOUTS);
  for (const zone of ZONES) if (OPTIONS[zone.id].some(p => p.code === q.get(zone.id))) state[zone.id] = q.get(zone.id);
  for (const [key, [min, max]] of Object.entries(NUMBERS)) {
    const value = Number(q.get(key));
    if (q.has(key) && Number.isFinite(value) && value >= min && value <= max) state[key] = value;
  }
  if ([0, 5, 10, 15, 20].includes(Number(q.get('reserve'))) && q.has('reserve')) state.reserve = Number(q.get('reserve'));
  return state;
}
export function stateHash(state) {
  return new URLSearchParams(Object.keys(DEFAULT_STATE).map(k => [k, String(state[k])])).toString();
}

export const COPING_WIDTH = 0.3;
/** Tiled areas in m² for a rectangular pool; steps are covered by the cutting reserve. */
export function poolAreas({ length, width, depth, deckArea, type }) {
  const bowl = length * width + 2 * (length + width) * depth;
  const coping = type === 'skimmer' ? 2 * (length + width) * COPING_WIDTH + 4 * COPING_WIDTH ** 2 : 0;
  return { deck: deckArea, bowl: Math.round(bowl * 100) / 100, coping: Math.round(coping * 100) / 100 };
}
/** One calculation line per zone; the same SKU on two zones is merged before rounding to boxes. */
export function estimate(state) {
  const areas = poolAreas(state);
  const byCode = new Map();
  for (const zone of ZONES) {
    if (!areas[zone.id]) continue;
    const entry = byCode.get(state[zone.id]) || { code: state[zone.id], zones: [], zoneArea: 0 };
    entry.zones.push(zone.label); entry.zoneArea += areas[zone.id]; byCode.set(entry.code, entry);
  }
  const lines = [...byCode.values()].map(e => ({ ...e, ...calculateArea(e.code, Math.round(e.zoneArea * 100) / 100, state.reserve) }));
  return { areas, lines, totalKopecks: lines.reduce((sum, l) => sum + l.totalKopecks, 0) };
}
