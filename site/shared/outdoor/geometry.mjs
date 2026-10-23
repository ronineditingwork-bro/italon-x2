// X2 Outdoor Lab: геометрия. Чистые функции без DOM, проверяются в Node.
// Всё построено на одной идее: плоскость (земля, терраса, стена) задаётся гомографией H, которая переводит пиксель фото (u, v; начало — левый верх)
// в координаты на плоскости в метрах (X, Z). Рисунок плитки считается в этих метрах, поэтому перспектива и реальный масштаб получаются сами.
// H — массив из 9 чисел по строкам: q = H·(u, v, 1), (X, Z) = (q0 / q2, q1 / q2).

export const mul3 = (A, B) => {
  const R = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) R[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j];
  return R;
};
export const det3 = H => H[0] * (H[4] * H[8] - H[5] * H[7]) - H[1] * (H[3] * H[8] - H[5] * H[6]) + H[2] * (H[3] * H[7] - H[4] * H[6]);
export function inv3(H) {
  const d = det3(H); if (!Number.isFinite(d) || Math.abs(d) < 1e-300) return null;
  const [a, b, c, e, f, g, h, i, j] = H;
  return [(f * j - g * i) / d, (c * i - b * j) / d, (b * g - c * f) / d, (g * h - e * j) / d, (a * j - c * h) / d, (c * e - a * g) / d, (e * i - f * h) / d, (b * h - a * i) / d, (a * f - b * e) / d];
}
/** Применить гомографию: {x, y, w} — w это знаменатель (знак показывает, по какую сторону от горизонта точка). */
export function apply(H, u, v) {
  const w = H[6] * u + H[7] * v + H[8];
  return { x: (H[0] * u + H[1] * v + H[2]) / w, y: (H[3] * u + H[4] * v + H[5]) / w, w };
}

/** Гомография по четырём парам точек (src → dst). null, если точки вырождены (три на одной прямой, совпадают). */
export function solveHomography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [X, Y] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-9) return null;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < n; r++) { const k = A[r][c] / A[c][c]; for (let j = c; j < n; j++) A[r][j] -= k * A[c][j]; b[r] -= k * b[c]; }
  }
  const h = new Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let j = r + 1; j < n; j++) s -= A[r][j] * h[j]; h[r] = s / A[r][r]; }
  const H = [...h, 1];
  return H.every(Number.isFinite) ? H : null;
}

/** Площадь выпуклого четырёхугольника на фото (пиксели) — для проверки «опорный четырёхугольник не вырожден». */
export function polygonAreaPx(pts) {
  let s = 0; for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; s += x1 * y2 - x2 * y1; }
  return Math.abs(s) / 2;
}
/** Четырёхугольник годится как опорный: выпуклый, не вырожденный. */
export function isConvexQuad(pts) {
  if (!pts || pts.length !== 4) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % 4], [cx, cy] = pts[(i + 2) % 4];
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(cross) < 1e-6) return false;
    const s = Math.sign(cross); if (sign && s !== sign) return false; sign = s;
  }
  return true;
}

/**
 * Опорный четырёхугольник → плоскость. Точки по порядку: левый дальний, правый дальний, правый ближний, левый ближний
 * (для стены — левый верх, правый верх, правый низ, левый низ). width — длина стороны 1–2, length — стороны 2–3, в метрах.
 */
export function quadHomography(pts, width, length) {
  if (!isConvexQuad(pts) || !(width > 0) || !(length > 0)) return null;
  return solveHomography(pts, [[0, 0], [width, 0], [width, length], [0, length]]);
}

/**
 * Камера → плоскость земли. Параметры: размер кадра, горизонт (v-координата линии горизонта в пикселях; может быть и за кадром),
 * поворот камеры вокруг вертикали (yawDeg), поле зрения по ширине (fovDeg) и высота камеры над землёй (heightM).
 * Правдоподобие, а не инженерия: у снимка с телефона fov ≈ 60–70°, высота ≈ 1,2–1,7 м.
 */
export function cameraHomography({ width, height, horizon, yawDeg = 0, fovDeg = 62, heightM = 1.6, focal }) {
  const f = focal || (width / 2) / Math.tan(fovDeg * Math.PI / 360), cx = width / 2, cy = height / 2;
  const th = Math.atan2(cy - horizon, f), ps = yawDeg * Math.PI / 180;
  const sp = Math.sin(ps), cp = Math.cos(ps), st = Math.sin(th), ct = Math.cos(th);
  const F = [sp * ct, -st, cp * ct], R = [cp, 0, -sp], D = [-sp * st, -ct, -cp * st];
  const row = (k, sk) => [sk * R[k], sk * D[k], sk * (-R[k] * cx - D[k] * cy + F[k] * f)];
  const x = row(0, 1), z = row(2, 1);
  return [...x, ...z, 0, ct / heightM, (-ct * cy + st * f) / heightM];
}
/** Масштаб плоскости: все расстояния умножаются на k. */
export const scaleHomography = (H, k) => [H[0] * k, H[1] * k, H[2] * k, H[3] * k, H[4] * k, H[5] * k, H[6], H[7], H[8]];
/** Расстояние в метрах между двумя точками фото на плоскости H. */
export function worldDistance(H, a, b) {
  const p = apply(H, a[0], a[1]), q = apply(H, b[0], b[1]);
  if (!(p.w > 0 === q.w > 0) || !Number.isFinite(p.x + p.y + q.x + q.y)) return NaN;
  return Math.hypot(p.x - q.x, p.y - q.y);
}
/** Масштабировать плоскость так, чтобы известное расстояние между двумя точками стало равно meters. null, если точки совпадают или лежат по разные стороны от горизонта. */
export function calibrateByDistance(H, a, b, meters) {
  const d = worldDistance(H, a, b);
  if (!(d > 1e-6) || !(meters > 0)) return null;
  return scaleHomography(H, meters / d);
}

/**
 * Площадь маски на плоскости, м². mask — Uint8Array яркости/альфы (порог 128), w × h, step — шаг выборки в пикселях.
 * Элемент площади для гомографии: |det H| / w³ на пиксель. Точки по другую сторону горизонта (знак w) не считаются. Точки у горизонта (дальше maxDist м) не считаются — иначе площадь «уходит в бесконечность».
 */
export function maskArea(H, mask, w, h, { step = 2, maxDist = 80, channel = 0, stride = 1, sign: wantSign = 0 } = {}) {
  const dh = Math.abs(det3(H)); let area = 0, counted = 0, far = 0, total = 0, sign = wantSign;       // sign — какая сторона горизонта допустима (для камеры +1); 0 — по первому пикселю
  for (let y = step >> 1; y < h; y += step) for (let x = step >> 1; x < w; x += step) {
    if (mask[(y * w + x) * stride + channel] < 128) continue;
    total++;
    const q = H[6] * x + H[7] * y + H[8];
    if (!sign) sign = Math.sign(q);
    if (!q || Math.sign(q) !== sign) { far++; continue; }
    const X = (H[0] * x + H[1] * y + H[2]) / q, Z = (H[3] * x + H[4] * y + H[5]) / q;
    if (Math.hypot(X, Z) > maxDist) { far++; continue; }
    area += dh / Math.abs(q * q * q) * step * step; counted++;
  }
  return { area, pixels: total, counted, far, reliable: total > 0 && far / total < 0.02 };
}

/** Центр масс маски (для наведения «Моего участка» и подписей зон). */
export function maskCentroid(mask, w, h, { step = 4, channel = 0, stride = 1 } = {}) {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (mask[(y * w + x) * stride + channel] >= 128) { sx += x; sy += y; n++; }
  return n ? [sx / n, sy / n] : null;
}
