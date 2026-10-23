// Рельеф по фотографии: высота = размытая светлота снимка, нормаль = её градиент. Это ХУДОЖЕСТВЕННАЯ оценка (на фото нет данных о настоящем рельефе
// поверхности), поэтому в интерфейсе она так и названа. Строится только для фото достаточного разрешения. Работает на ImageData/Uint8ClampedArray, поэтому проверяется в Node.
// Размеры: (data, n, opts) для квадрата n×n или (data, w, h, opts).
const dims = (a, b) => (typeof b === 'object' || b === undefined ? [a, a, b || {}] : [a, b, {}]);
export function luminance(data, w, h = w) {
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
  return L;
}
function boxBlur(src, w, h, r) {
  if (r <= 0) return src;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), k = 2 * r + 1;
  for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) { tmp[y * w + x] = s / k; s += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = s / k; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
  return out;
}
/**
 * RGBA-карта: RGB — нормаль (n·0.5+0.5, ось Y вверх по фото), A — высота 0..1. strength — «крутизна» (безразмерная; физическую высоту задаёт материал в шейдере).
 * Размытие делается дважды (радиус blur) — убирает шум JPEG/WebP, оставляя рельеф крупнее нескольких пикселей.
 */
export function buildNormalMap(data, a, b, c) {
  const [w, h, { blur = 1.5, strength = 3 }] = dims(a, c === undefined ? b : b), opts = c || (typeof b === 'object' ? b : {});
  let H = luminance(data, w, h);
  H = boxBlur(boxBlur(H, w, h, Math.round(opts.blur ?? blur)), w, h, Math.max(1, Math.round(opts.blur ?? blur)));
  let lo = 1, hi = 0; for (let i = 0; i < H.length; i++) { if (H[i] < lo) lo = H[i]; if (H[i] > hi) hi = H[i]; }
  const span = Math.max(1e-3, hi - lo), out = new Uint8ClampedArray(w * h * 4), st = opts.strength ?? strength, scale = Math.max(w, h) / 256;
  const at = (x, y) => H[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) / 8 / span;
    const gy = (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) - at(x - 1, y + 1) - 2 * at(x, y + 1) - at(x + 1, y + 1)) / 8 / span;
    let nx = -gx * st * scale, ny = -gy * st * scale, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    out[i] = Math.round((nx * 0.5 + 0.5) * 255); out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255); out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255); out[i + 3] = Math.round(((H[y * w + x] - lo) / span) * 255);
  }
  return out;
}
/** Средний цвет по снимку (sRGB 0..255) — для шва «в тон плитки». */
export function averageColor(data, a, b) {
  const n = typeof b === 'number' ? a * b : a * a; let r = 0, g = 0, bl = 0;
  for (let i = 0; i < n; i++) { r += data[i * 4]; g += data[i * 4 + 1]; bl += data[i * 4 + 2]; }
  return [r / n, g / n, bl / n];
}
