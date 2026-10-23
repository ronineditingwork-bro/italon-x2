// X2 Outdoor Lab: параметры укладки и правила сочетаний. Чистые функции — проверяются в Node, UI только отображает результат.
// Принцип: недоступные сочетания не прячем, а блокируем и объясняем почему (reason), чтобы нельзя было собрать то, чего в жизни не бывает.

export const ZONE_TYPES = {
  terrace: { label: 'Терраса', mounts: ['adhesive', 'pedestals', 'gravel'] },
  path: { label: 'Дорожка', mounts: ['grass', 'gravel', 'adhesive', 'pedestals'] },
  pool: { label: 'Бассейн', mounts: ['adhesive', 'pedestals'] },
  patio: { label: 'Патио', mounts: ['gravel', 'pedestals', 'adhesive', 'grass'] },
};
export const MOUNTS = [
  { id: 'grass', label: 'На траву', joints: ['grass'], hint: 'Плиты лежат в газоне, швы заполнены травой. Шов — только травяной.' },
  { id: 'gravel', label: 'На гравий', joints: ['gravel', 'wide', 'medium'], hint: 'Плиты на подготовленной гравийной подушке, швы засыпаны гравием.' },
  { id: 'pedestals', label: 'На опоры', joints: ['narrow', 'medium', 'wide'], hint: 'Плиты на регулируемых опорах, швы открытые, под покрытием — воздушный зазор.' },
  { id: 'adhesive', label: 'На клей', joints: ['narrow', 'medium', 'wide'], hint: 'Плиты на плиточном клее по основанию, швы затёрты.' },
];
export const JOINTS = [
  { id: 'narrow', label: 'Узкий', sub: '2–3 мм', mm: 3 },
  { id: 'medium', label: 'Средний', sub: '5–8 мм', mm: 6.5 },
  { id: 'wide', label: 'Широкий', sub: '10–15 мм', mm: 12 },
  { id: 'grass', label: 'Травяной шов', sub: 'с травой', mm: 25 },
  { id: 'gravel', label: 'Гравийный шов', sub: 'с гравием', mm: 25 },
];
export const LAYOUTS = [
  { id: 'straight', label: 'Прямая', hint: 'Плиты в одну линию, швы крест-накрест.' },
  { id: 'offset', label: 'Со смещением', hint: 'Каждый ряд сдвинут на половину плиты.' },
  { id: 'stepping', label: 'Пошаговая', hint: 'Плиты отдельно, с широкими промежутками, как ступени в траве или гравии.' },
];
export const DIRECTIONS = [
  { id: 'along', label: 'Вдоль', deg: 0, hint: 'Длинная сторона плиты вдоль основной линии (дом, бортик).' },
  { id: 'across', label: 'Поперёк', deg: 90, hint: 'Длинная сторона плиты поперёк основной линии.' },
  { id: 'diagonal', label: 'Диагональ', deg: 45, hint: 'Раскладка под углом 45°. Расход плитки больше.' },
];
export const STEPPING_GAP_M = 0.3;

const byId = list => Object.fromEntries(list.map(x => [x.id, x]));
export const MOUNT_BY_ID = byId(MOUNTS), JOINT_BY_ID = byId(JOINTS), LAYOUT_BY_ID = byId(LAYOUTS), DIRECTION_BY_ID = byId(DIRECTIONS);
export const jointMm = id => (JOINT_BY_ID[id] || JOINT_BY_ID.narrow).mm;
const defaultJoint = mount => ({ grass: 'grass', gravel: 'gravel' }[mount] || 'narrow');
const isSquare = f => { const m = String(f || '').match(/^(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)$/); return !!m && Number(m[1]) === Number(m[2]); };
export const isSquareFormat = isSquare;

/**
 * Что можно выбрать при текущем сочетании. material — { formats: [...] }. Возвращает по каждой группе список { id, enabled, reason }.
 * Правила: монтаж зависит от типа зоны; шов — от монтажа; «пошаговая» — только на дорожке и патио с травой/гравием в швах; у квадратной плитки «поперёк» совпадает с «вдоль».
 */
export function optionStates({ zoneType = 'terrace', material, settings }) {
  const zone = ZONE_TYPES[zoneType] || ZONE_TYPES.terrace;
  const s = settings || {};
  const formats = (material?.formats || []).map(id => ({ id, enabled: true, reason: '' }));
  const mounts = MOUNTS.map(m => zone.mounts.includes(m.id) ? { id: m.id, enabled: true, reason: '' } : { id: m.id, enabled: false, reason: `${m.label.toLowerCase()}: не для зоны «${zone.label.toLowerCase()}»` });
  const mount = MOUNT_BY_ID[s.mount] || MOUNTS[3];
  const joints = JOINTS.map(j => mount.joints.includes(j.id) ? { id: j.id, enabled: true, reason: '' } : { id: j.id, enabled: false, reason: j.id === 'grass' ? 'Травяной шов — только при укладке на траву' : j.id === 'gravel' ? 'Гравийный шов — только при укладке на гравий' : `При укладке «${mount.label.toLowerCase()}» открытые швы не применяются` });
  const steppingOk = (zoneType === 'path' || zoneType === 'patio') && (mount.id === 'grass' || mount.id === 'gravel');
  const layouts = LAYOUTS.map(l => l.id !== 'stepping' || steppingOk ? { id: l.id, enabled: true, reason: '' } : { id: l.id, enabled: false, reason: 'Пошаговая раскладка — для дорожки и патио на траве или гравии' });
  const square = isSquare(s.format);
  const directions = DIRECTIONS.map(d => d.id !== 'across' || !square ? { id: d.id, enabled: true, reason: '' } : { id: d.id, enabled: false, reason: 'У квадратной плитки «поперёк» выглядит так же, как «вдоль»' });
  return { formats, mounts, joints, layouts, directions };
}

/** Привести настройки к допустимому сочетанию (после любого изменения). notes — что пришлось поменять, для подсказки пользователю. */
export function normalizeSettings(input, { zoneType = 'terrace', material } = {}) {
  const s = { ...input }, notes = [];
  const zone = ZONE_TYPES[zoneType] || ZONE_TYPES.terrace;
  if (material?.formats?.length && !material.formats.includes(s.format)) { s.format = material.formats[0]; }
  if (!zone.mounts.includes(s.mount)) { s.mount = zone.mounts.includes('adhesive') ? 'adhesive' : zone.mounts[0]; notes.push(`Монтаж изменён на «${MOUNT_BY_ID[s.mount].label.toLowerCase()}» (для зоны «${zone.label.toLowerCase()}»)`); }
  const mount = MOUNT_BY_ID[s.mount];
  if (!mount.joints.includes(s.joint)) { s.joint = defaultJoint(s.mount); notes.push(`Шов изменён на «${JOINT_BY_ID[s.joint].label.toLowerCase()}»`); }
  const st = optionStates({ zoneType, material, settings: s });
  if (!LAYOUT_BY_ID[s.layout] || !st.layouts.find(l => l.id === s.layout)?.enabled) { if (s.layout === 'stepping') notes.push('Раскладка изменена на «со смещением»'); s.layout = LAYOUT_BY_ID[s.layout] && s.layout !== 'stepping' ? s.layout : 'offset'; }
  if (!DIRECTION_BY_ID[s.direction] || !st.directions.find(d => d.id === s.direction)?.enabled) s.direction = 'along';
  if (s.layout === 'stepping' && !['grass', 'gravel'].includes(s.joint)) s.joint = defaultJoint(s.mount);
  return { settings: s, notes };
}

/** Разбор формата «60X120» → метры [короткая, длинная]. */
export function formatMeters(format) {
  const m = String(format || '').match(/^(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)$/); if (!m) return null;
  const a = Number(m[1]) / 100, b = Number(m[2]) / 100; return a <= b ? [a, b] : [b, a];
}

/**
 * Настройки → параметры шейдера. Оси: X — основная линия, Z — вглубь; «вдоль» кладёт длинную сторону плиты вдоль X.
 * jointKind: 0 затирка, 1 трава, 2 гравий, 3 открытый шов на опорах.
 */
export function shaderParams(settings) {
  const dims = formatMeters(settings.format) || [0.6, 1.2];
  const across = settings.direction === 'across';
  const stepping = settings.layout === 'stepping';
  const joint = stepping ? STEPPING_GAP_M : jointMm(settings.joint) / 1000;
  const jointKind = settings.joint === 'grass' ? 1 : settings.joint === 'gravel' ? 2 : settings.mount === 'pedestals' ? 3 : 0;
  return {
    tileX: across ? dims[0] : dims[1], tileZ: across ? dims[1] : dims[0],
    short: dims[0], long: dims[1],                      // для разворота текстуры: рисунок вытянут вдоль длинной стороны
    joint, jointKind, mount: ['grass', 'gravel', 'pedestals', 'adhesive'].indexOf(settings.mount),
    offset: settings.layout === 'straight' ? 0 : 0.5,
    angle: settings.direction === 'diagonal' ? Math.PI / 4 : 0,
    stepping,
  };
}

/** Какую долю зоны реально закрывают плиты (швы не считаем, у «пошаговой» — промежутки) и запас на подрезку. */
export function coverage(settings) {
  const p = shaderParams(settings);
  return p.stepping ? (p.tileX * p.tileZ) / ((p.tileX + p.joint) * (p.tileZ + p.joint)) : 1;
}
export function wasteFraction(settings) {
  if (settings.layout === 'stepping') return 0.05;
  return settings.direction === 'diagonal' ? 0.15 : 0.10;
}
