// Описание внешнего вида плитки числами — для подбора похожей по загруженному изображению.
// Один и тот же код считает признаки каталога (при сборке, scripts/build-picker-features.cjs, в headless Chromium) и признаки загруженного
// посетителем снимка (в его браузере): так сравнение «яблоко с яблоком». Изображение никуда не отправляется.
// Вход — RGBA-пиксели (как ImageData: {data, width, height}); выход — набор групп признаков:
//   lab   — средний цвет и разброс (L*a*b*), с запасом на разные камеры и освещение;
//   hist  — «грубая гистограмма» цветов (L × a × b), сглаженная, в виде корней долей (расстояние Хеллингера);
//   tex   — текстура: насыщенность рёбер, зернистость, прожилки, однородность, направленность (без привязки к повороту снимка);
//   grid  — средняя светлота по сетке 3×3 (светлый верх/низ, градиенты окраски).
export const N = 48;               // рабочий размер
export const HIST = { L: 6, A: 5, B: 5 };
export const HIST_LEN = HIST.L * HIST.A * HIST.B;
const AMIN = -12, AMAX = 18, BMIN = -12, BMAX = 38;

const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const LIN = new Float32Array(256); for (let i = 0; i < 256; i++) LIN[i] = lin(i);
const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
export function rgbToLab(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047, Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B, Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// Границы плитки на фото каталога: фон — чисто белый (≥ 253 по всем каналам). Для снимка посетителя фон не вырезаем.
export function tileBounds({ data, width, height }, { white = 253, minShare = 0.02 } = {}) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  const colHits = new Uint32Array(width), rowHits = new Uint32Array(height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (data[i + 3] > 8 && !(data[i] >= white && data[i + 1] >= white && data[i + 2] >= white)) { colHits[x]++; rowHits[y]++; }
  }
  for (let x = 0; x < width; x++) if (colHits[x] >= height * minShare) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  for (let y = 0; y < height; y++) if (rowHits[y] >= width * minShare) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < x0 || y1 < y0) return { x: 0, y: 0, w: width, h: height };
  // 2% внутрь: края плитки часто тёмные/светлые из-за тени и сжатия
  const mx = Math.round((x1 - x0 + 1) * 0.02), my = Math.round((y1 - y0 + 1) * 0.02);
  return { x: x0 + mx, y: y0 + my, w: Math.max(1, x1 - x0 + 1 - 2 * mx), h: Math.max(1, y1 - y0 + 1 - 2 * my) };
}

// Площадное усреднение области до N×N → Float32 Lab (по трём плоскостям)
export function resampleLab({ data, width, height }, box = { x: 0, y: 0, w: width, h: height }, n = N) {
  const L = new Float32Array(n * n), A = new Float32Array(n * n), B = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const xs = box.x + (i * box.w) / n, xe = box.x + ((i + 1) * box.w) / n, ys = box.y + (j * box.h) / n, ye = box.y + ((j + 1) * box.h) / n;
    let r = 0, g = 0, b = 0, wsum = 0;
    for (let y = Math.floor(ys); y < Math.ceil(ye); y++) {
      const wy = Math.min(y + 1, ye) - Math.max(y, ys); if (wy <= 0 || y < 0 || y >= height) continue;
      for (let x = Math.floor(xs); x < Math.ceil(xe); x++) {
        const wx = Math.min(x + 1, xe) - Math.max(x, xs); if (wx <= 0 || x < 0 || x >= width) continue;
        const k = (y * width + x) * 4, w = wx * wy, a = data[k + 3] / 255;
        // прозрачное → белое
        r += (data[k] * a + 255 * (1 - a)) * w; g += (data[k + 1] * a + 255 * (1 - a)) * w; b += (data[k + 2] * a + 255 * (1 - a)) * w; wsum += w;
      }
    }
    const lab = rgbToLab(Math.round(r / wsum), Math.round(g / wsum), Math.round(b / wsum)), p = j * n + i;
    L[p] = lab[0]; A[p] = lab[1]; B[p] = lab[2];
  }
  return { L, A, B, n };
}

const mean = a => { let s = 0; for (const v of a) s += v; return s / a.length; };
const std = (a, m = mean(a)) => { let s = 0; for (const v of a) s += (v - m) ** 2; return Math.sqrt(s / a.length); };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function coarseHist({ L, A, B }) {
  const h = new Float32Array(HIST_LEN), tmp = new Float32Array(HIST_LEN);
  for (let p = 0; p < L.length; p++) {
    const li = clamp(Math.floor(L[p] / 100 * HIST.L), 0, HIST.L - 1);
    const ai = clamp(Math.floor((A[p] - AMIN) / (AMAX - AMIN) * HIST.A), 0, HIST.A - 1);
    const bi = clamp(Math.floor((B[p] - BMIN) / (BMAX - BMIN) * HIST.B), 0, HIST.B - 1);
    tmp[(li * HIST.A + ai) * HIST.B + bi] += 1;
  }
  // лёгкое сглаживание по соседним ячейкам (устойчивость к освещению), затем корни долей
  let total = 0;
  for (let li = 0; li < HIST.L; li++) for (let ai = 0; ai < HIST.A; ai++) for (let bi = 0; bi < HIST.B; bi++) {
    let s = 0, w = 0;
    for (let dl = -1; dl <= 1; dl++) for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
      const l2 = li + dl, a2 = ai + da, b2 = bi + db;
      if (l2 < 0 || l2 >= HIST.L || a2 < 0 || a2 >= HIST.A || b2 < 0 || b2 >= HIST.B) continue;
      const wt = (dl === 0 && da === 0 && db === 0) ? 4 : 1; s += tmp[(l2 * HIST.A + a2) * HIST.B + b2] * wt; w += wt;
    }
    const v = s / w; h[(li * HIST.A + ai) * HIST.B + bi] = v; total += v;
  }
  for (let i = 0; i < h.length; i++) h[i] = Math.sqrt(h[i] / total);
  return h;
}

// Текстура по плоскости светлоты
function textureOf(L, n) {
  const gx = new Float32Array(n * n), gy = new Float32Array(n * n), mag = new Float32Array(n * n);
  let sumMag = 0;
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const p = y * n + x;
    const dx = (L[p - n + 1] + 2 * L[p + 1] + L[p + n + 1]) - (L[p - n - 1] + 2 * L[p - 1] + L[p + n - 1]);
    const dy = (L[p + n - 1] + 2 * L[p + n] + L[p + n + 1]) - (L[p - n - 1] + 2 * L[p - n] + L[p - n + 1]);
    gx[p] = dx / 8; gy[p] = dy / 8; mag[p] = Math.hypot(dx, dy) / 8; sumMag += mag[p];
  }
  const m = n - 2, cnt = m * m;
  const fine = sumMag / cnt;
  // направленность: тензор градиентов → когерентность 0..1 (не зависит от поворота)
  let jxx = 0, jyy = 0, jxy = 0;
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) { const p = y * n + x; jxx += gx[p] * gx[p]; jyy += gy[p] * gy[p]; jxy += gx[p] * gy[p]; }
  const tr = jxx + jyy, det = Math.sqrt(Math.max(0, (jxx - jyy) ** 2 + 4 * jxy * jxy));
  const coherence = tr > 1e-6 ? det / tr : 0;
  // доля «рёбер» (тонкие прожилки и швы): градиент выше порога
  let edges = 0, strong = 0;
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) { const v = mag[y * n + x]; if (v > 2.2) edges++; if (v > 6) strong++; }
  // крупная неоднородность: разброс средних по ячейкам 6×6 («облачность», пятна)
  const g = 6, cell = n / g, cm = [];
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) { let s = 0, c = 0; for (let y = Math.floor(j * cell); y < Math.floor((j + 1) * cell); y++) for (let x = Math.floor(i * cell); x < Math.floor((i + 1) * cell); x++) { s += L[y * n + x]; c++; } cm.push(s / c); }
  const cloud = std(cm);
  // зернистость: разница между пикселем и локальным средним 3×3 (мелкий шум/фактура)
  let grain = 0;
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) { const p = y * n + x; let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += L[p + dy * n + dx]; grain += Math.abs(L[p] - s / 9); }
  grain /= cnt;
  // прожилки: пиксели, заметно отличающиеся от окрестности 7×7 (светлые/тёмные линии на фоне)
  let veins = 0;
  for (let y = 3; y < n - 3; y++) for (let x = 3; x < n - 3; x++) { let s = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) s += L[(y + dy) * n + x + dx]; if (Math.abs(L[y * n + x] - s / 49) > 7) veins++; }
  veins /= (n - 6) * (n - 6);
  return { fine, edges: edges / cnt, strong: strong / cnt, coherence, cloud, grain, veins, stdL: std(L) };
}

export function describe(img, { crop = false, box } = {}) {
  const b = box || (crop ? tileBounds(img) : { x: 0, y: 0, w: img.width, h: img.height });
  const lab = resampleLab(img, b);
  const { L, A, B, n } = lab;
  const mL = mean(L), mA = mean(A), mB = mean(B);
  const sL = std(L, mL), sA = std(A, mA), sB = std(B, mB);
  const chroma = Math.hypot(mA, mB), hue = (Math.atan2(mB, mA) * 180 / Math.PI + 360) % 360;
  const tex = textureOf(L, n);
  const grid = []; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { let s = 0, c = 0; for (let y = Math.floor(j * n / 3); y < Math.floor((j + 1) * n / 3); y++) for (let x = Math.floor(i * n / 3); x < Math.floor((i + 1) * n / 3); x++) { s += L[y * n + x]; c++; } grid.push(s / c); }
  return { mean: [mL, mA, mB], spread: [sL, sA, sB], chroma, hue, hist: coarseHist(lab), tex, grid, box: b };
}

// ---- сжатие для хранения: uint8 в base64 -------------------------------------------------------------------------------
export const TEX_KEYS = ['fine', 'edges', 'strong', 'coherence', 'cloud', 'grain', 'veins', 'stdL'];
const TEX_SCALE = { fine: 8, edges: 1, strong: 0.5, coherence: 1, cloud: 20, grain: 6, veins: 0.5, stdL: 40 };
const q = (v, s) => clamp(Math.round(v / s * 255), 0, 255);
const dq = (v, s) => v / 255 * s;
export function pack(d) {
  const out = new Uint8Array(3 + 3 + 1 + 1 + HIST_LEN + TEX_KEYS.length + 9);
  let k = 0;
  out[k++] = q(d.mean[0], 100); out[k++] = q(d.mean[1] + 40, 80); out[k++] = q(d.mean[2] + 40, 100);
  out[k++] = q(d.spread[0], 40); out[k++] = q(d.spread[1], 20); out[k++] = q(d.spread[2], 20);
  out[k++] = q(d.chroma, 60); out[k++] = q(d.hue, 360);
  for (const v of d.hist) out[k++] = q(v, 1);
  for (const key of TEX_KEYS) out[k++] = q(d.tex[key], TEX_SCALE[key]);
  for (const v of d.grid) out[k++] = q(v, 100);
  return out;
}
export function unpack(bytes) {
  let k = 0; const o = { mean: [], spread: [], hist: new Float32Array(HIST_LEN), tex: {}, grid: [] };
  o.mean = [dq(bytes[k++], 100), dq(bytes[k++], 80) - 40, dq(bytes[k++], 100) - 40];
  o.spread = [dq(bytes[k++], 40), dq(bytes[k++], 20), dq(bytes[k++], 20)];
  o.chroma = dq(bytes[k++], 60); o.hue = dq(bytes[k++], 360);
  for (let i = 0; i < HIST_LEN; i++) o.hist[i] = dq(bytes[k++], 1);
  for (const key of TEX_KEYS) o.tex[key] = dq(bytes[k++], TEX_SCALE[key]);
  for (let i = 0; i < 9; i++) o.grid.push(dq(bytes[k++], 100));
  return o;
}
export const toBase64 = u8 => typeof Buffer !== 'undefined' ? Buffer.from(u8).toString('base64') : btoa(String.fromCharCode(...u8));
export const fromBase64 = s => typeof Buffer !== 'undefined' ? new Uint8Array(Buffer.from(s, 'base64')) : Uint8Array.from(atob(s), c => c.charCodeAt(0));

// ---- сходство -------------------------------------------------------------------------------------------------------------
// Расстояние 0 (одинаково) … ~1 (совсем разное); меньше — похожее. Веса подобраны на самопроверке (tests/picker.test.mjs): поиск по искажённой копии фото.
export const WEIGHTS = { color: 0.25, hist: 0.20, tex: 0.45, grid: 0.10 };
export const TUNE = { dL: 60, dA: 20, dB: 20, colDiv: 1.5, spreadDiv: 20, gridDiv: 30, texHalf: 0.7 };
// «Тот же рисунок, другой тон»: сравниваем только текстуру и раскладку светлоты без учёта общего оттенка
export const PATTERN_WEIGHTS = { color: 0, hist: 0.05, tex: 0.85, grid: 0.10 };
export function distance(a, b, w = WEIGHTS, t = TUNE) {
  const dL = (a.mean[0] - b.mean[0]) / t.dL, dA = (a.mean[1] - b.mean[1]) / t.dA, dB = (a.mean[2] - b.mean[2]) / t.dB;
  const color = clamp(Math.hypot(dL, dA, dB) / t.colDiv, 0, 1) * 0.8 + clamp(Math.abs(a.spread[0] - b.spread[0]) / t.spreadDiv, 0, 1) * 0.2;
  let bc = 0; for (let i = 0; i < HIST_LEN; i++) bc += a.hist[i] * b.hist[i];
  const hist = Math.sqrt(Math.max(0, 1 - bc));
  let tt = 0;
  for (const key of TEX_KEYS) { const sc = TEX_SCALE[key]; const dv = (a.tex[key] - b.tex[key]) / (sc * t.texHalf); tt += dv * dv; }
  const tex = clamp(Math.sqrt(tt / TEX_KEYS.length), 0, 1);
  let g = 0; for (let i = 0; i < 9; i++) g += Math.abs(a.grid[i] - b.grid[i]); const grid = clamp(g / 9 / t.gridDiv, 0, 1);
  return w.color * color + w.hist * hist + w.tex * tex + w.grid * grid;
}
export const similarity = d => Math.round(clamp(1 - d / 0.55, 0, 1) * 100);   // «процент сходства» для показа: 0.55 и дальше — уже не похоже
