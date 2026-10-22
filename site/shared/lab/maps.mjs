// Рельеф по фотографии: высота = размытая светлота снимка, нормаль = её градиент. Это ХУДОЖЕСТВЕННАЯ оценка (на фото нет данных о настоящем рельефе
// поверхности), поэтому в интерфейсе она так и названа. Работает на ImageData/Uint8ClampedArray, поэтому проверяется в Node.
export function luminance(data, n) {
  const L = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) L[i] = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
  return L;
}
function boxBlur(src, n, r) {
  if (r <= 0) return src;
  const tmp = new Float32Array(n * n), out = new Float32Array(n * n), k = 2 * r + 1;
  for (let y = 0; y < n; y++) { let s = 0; for (let x = -r; x <= r; x++) s += src[y * n + Math.min(n - 1, Math.max(0, x))];
    for (let x = 0; x < n; x++) { tmp[y * n + x] = s / k; s += src[y * n + Math.min(n - 1, x + r + 1)] - src[y * n + Math.max(0, x - r)]; } }
  for (let x = 0; x < n; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(n - 1, Math.max(0, y)) * n + x];
    for (let y = 0; y < n; y++) { out[y * n + x] = s / k; s += tmp[Math.min(n - 1, y + r + 1) * n + x] - tmp[Math.max(0, y - r) * n + x]; } }
  return out;
}
/**
 * RGBA-карта: RGB — нормаль (n·0.5+0.5, ось Y вверх по фото), A — высота 0..1. strength — «крутизна» (безразмерная; физическую высоту задаёт материал в шейдере).
 * Размытие делается дважды (радиус blur) — убирает шум JPEG/WebP, оставляя рельеф крупнее нескольких пикселей.
 */
export function buildNormalMap(data, n, { blur = 1.5, strength = 3 } = {}) {
  let H = luminance(data, n);
  H = boxBlur(boxBlur(H, n, Math.round(blur)), n, Math.max(1, Math.round(blur)));
  // нормировка высоты к 0..1, чтобы относительная «глубина» не зависела от общей яркости фото
  let lo = 1, hi = 0; for (let i = 0; i < H.length; i++) { if (H[i] < lo) lo = H[i]; if (H[i] > hi) hi = H[i]; }
  const span = Math.max(1e-3, hi - lo), out = new Uint8ClampedArray(n * n * 4);
  const at = (x, y) => H[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) / 8 / span;
    const gy = (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) - at(x - 1, y + 1) - 2 * at(x, y + 1) - at(x + 1, y + 1)) / 8 / span;   // по фото вверх — это «минус y пикселей»
    let nx = -gx * strength * n / 256, ny = -gy * strength * n / 256, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * n + x) * 4;
    out[i] = Math.round((nx * 0.5 + 0.5) * 255); out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255); out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255); out[i + 3] = Math.round(((H[y * n + x] - lo) / span) * 255);
  }
  return out;
}
/** Средний цвет по снимку (sRGB 0..255) — для шва «в тон плитки». */
export function averageColor(data, n) {
  let r = 0, g = 0, b = 0; for (let i = 0; i < n * n; i++) { r += data[i * 4]; g += data[i * 4 + 1]; b += data[i * 4 + 2]; }
  const k = n * n; return [r / k, g / k, b / k];
}
