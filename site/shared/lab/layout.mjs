// Раскладка плитки на поверхности (сантиметры): формат, шов, прямая или смещённая укладка, случайные «варианты» плиток.
// Эталон для шейдера: в gl.mjs та же арифметика (проверяется тестом по пикселям — tests/lab.test.mjs и tests/lab-e2e.cjs).
export const FORMATS = [
  { id: '30x30', w: 30, h: 30, label: '30 × 30' },
  { id: '30x60', w: 30, h: 60, label: '30 × 60' },
  { id: '60x60', w: 60, h: 60, label: '60 × 60' },
  { id: '60x120', w: 60, h: 120, label: '60 × 120' },
  { id: '80x80', w: 80, h: 80, label: '80 × 80' },
  { id: '20x120', w: 20, h: 120, label: '20 × 120 (доска)' },
  { id: '120x120', w: 120, h: 120, label: '120 × 120' },
];
export const JOINT_COLORS = [
  { id: 'tone', label: 'В тон плитки', color: null },
  { id: 'white', label: 'Белый', color: '#e9e6df' },
  { id: 'grey', label: 'Серый', color: '#a7a49d' },
  { id: 'graphite', label: 'Графит', color: '#37383a' },
  { id: 'black', label: 'Чёрный', color: '#0e0f10' },
];
export const BONDS = [
  { id: 'straight', label: 'Прямая', mode: 0 },
  { id: 'half', label: 'Со сдвигом ½', mode: 1 },
  { id: 'third', label: 'Со сдвигом ⅓', mode: 2 },
];
export const JOINT_MAX_MM = 10;

const U32 = v => v >>> 0;
/** Целочисленный хэш (col, row) → [0, 1). Побитово совпадает с GLSL-версией. */
export function hash2(col, row) {
  let h = U32(Math.imul(col | 0, 374761393) + Math.imul(row | 0, 668265263));
  h = U32(Math.imul(h ^ (h >>> 13), 1274126177));
  h = U32(h ^ (h >>> 16));
  return (h & 0xFFFFFF) / 16777216;
}
export const rowShift = (mode, row) => mode === 1 ? (((row % 2) + 2) % 2) * 0.5 : mode === 2 ? (((row % 3) + 3) % 3) / 3 : 0;

/**
 * Какая плитка лежит в точке (x, y) см. Шов — полоса шириной joint между плитками; плитка занимает [0, w] × [0, h] в своих координатах.
 * edge — расстояние от точки до ближайшего края плитки (см), отрицательное — внутри шва.
 */
export function tileAt(x, y, { w, h, joint, mode }) {
  const px = w + joint, py = h + joint;
  const row = Math.floor(y / py);
  const xs = x - rowShift(mode, row) * px;
  const col = Math.floor(xs / px);
  const lx = xs - col * px - joint / 2, ly = y - row * py - joint / 2;
  const inside = lx >= 0 && lx <= w && ly >= 0 && ly <= h;
  const edge = inside ? Math.min(lx, w - lx, ly, h - ly) : -Math.max(Math.max(-lx, lx - w, 0), Math.max(-ly, ly - h, 0));
  return { col, row, lx, ly, inside, edge };
}
/** Случайный «вариант» плитки: у одной фотографии каталога разворот и сдвиг окна, чтобы поле не выглядело штампом. */
export const HASH_OFFSET = 100000;      // сдвиг индексов, чтобы хэш считался только от неотрицательных чисел (одинаково в JS и в шейдере)
export function variantOf(col, row) {
  const c = col + HASH_OFFSET, r = row + HASH_OFFSET;
  const a = hash2(c, r), b = hash2(c + 7919, r + 104729), cc = hash2(r * 31 + 5, c * 17 + 3);
  return { flipX: a > 0.5, flipY: b > 0.5, ox: cc, oy: hash2(c ^ 0x5bd1, r ^ 0x1b873), tone: (a * 0.5 + b * 0.5), id: a };
}
const mirror = t => { const m = ((t % 2) + 2) % 2; return m > 1 ? 2 - m : m; };
/**
 * Координаты в фотографии (0..1) для точки внутри плитки. photoW/H — физические размеры, которые покрывает фото (формат изделия, см).
 * Если плитка в раскладке меньше изделия — берётся окно фото со случайным сдвигом; больше — фото продолжается зеркально.
 */
export function photoUV(lx, ly, w, h, variant, photoW, photoH) {
  let u = lx / w, v = ly / h;
  if (variant.flipX) u = 1 - u; if (variant.flipY) v = 1 - v;
  const sw = w / photoW, sh = h / photoH;
  const ox = sw < 1 ? variant.ox * (1 - sw) : 0, oy = sh < 1 ? variant.oy * (1 - sh) : 0;
  return { u: mirror(ox + u * sw), v: mirror(oy + v * sh) };
}
export const jointCm = mm => Math.max(0, Math.min(JOINT_MAX_MM, mm)) / 10;
