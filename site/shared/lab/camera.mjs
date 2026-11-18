// Камера лаборатории: плоскость поверхности z = 0 (сантиметры), камера смотрит на точку center с наклоном tilt и поворотом rot.
// Одна и та же математика работает в шейдере (gl.mjs), в 2D-запасном режиме и в интерфейсе (положение «шара света», перетаскивание поверхности).
//   center — точка поверхности в центре кадра [x, y] (см); rot — поворот вида вокруг вертикали (рад); tilt — наклон от вертикали (0 — вид сверху);
//   ppcm — пикселей на сантиметр в центре кадра (масштаб); DIST — расстояние от камеры до центра (см): задаёт перспективу.
export const DIST = 150;
export const TILT_MAX = 1.08;                // ≈ 62°: выше — горизонт и слишком скользящий угол

export function basis({ center, rot, tilt }) {
  const s = Math.sin(tilt), c = Math.cos(tilt);
  const right = [Math.cos(rot), Math.sin(rot)], up = [-Math.sin(rot), Math.cos(rot)];
  const eye = [center[0] - up[0] * DIST * s, center[1] - up[1] * DIST * s, DIST * c];
  const F = [up[0] * s, up[1] * s, -c];                  // вперёд (единичный)
  const R = [right[0], right[1], 0];                     // вправо на экране
  const U = [up[0] * c, up[1] * c, s];                   // вверх на экране
  return { eye, F, R, U };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Точка поверхности под пикселем (px, py — от левого верхнего угла, пиксели вида). Возвращает null, если луч уходит выше горизонта. */
export function unproject(cam, px, py, width, height) {
  const { eye, F, R, U } = basis(cam), f = cam.ppcm * DIST;
  const x = px - width / 2, y = height / 2 - py;
  const d = [F[0] + R[0] * x / f + U[0] * y / f, F[1] + R[1] * x / f + U[1] * y / f, F[2] + R[2] * x / f + U[2] * y / f];
  if (d[2] >= -1e-6) return null;
  const t = -eye[2] / d[2];
  return [eye[0] + d[0] * t, eye[1] + d[1] * t, 0];
}
/** Пиксель вида для точки пространства P = [x, y, z] (z — высота над поверхностью, см). Возвращает [px, py, depth] или null, если точка позади камеры. */
export function project(cam, P, width, height) {
  const { eye, F, R, U } = basis(cam), f = cam.ppcm * DIST;
  const V = [P[0] - eye[0], P[1] - eye[1], (P[2] || 0) - eye[2]], depth = dot(V, F);
  if (depth <= 1e-6) return null;
  return [width / 2 + f * dot(V, R) / depth, height / 2 - f * dot(V, U) / depth, depth];
}
/** Сдвиг: точка поверхности, бывшая под пикселем (px0, py0), оказывается под (px1, py1). Меняет cam.center. */
export function panBy(cam, px0, py0, px1, py1, width, height) {
  const a = unproject(cam, px0, py0, width, height), b = unproject(cam, px1, py1, width, height);
  if (a && b) { cam.center = [cam.center[0] + a[0] - b[0], cam.center[1] + a[1] - b[1]]; }
}
/** Масштаб вокруг пикселя: точка под (px, py) остаётся под курсором. */
export function zoomAt(cam, factor, px, py, width, height, [lo, hi] = [1.2, 40]) {
  const before = unproject(cam, px, py, width, height);
  cam.ppcm = Math.min(hi, Math.max(lo, cam.ppcm * factor));
  const after = unproject(cam, px, py, width, height);
  if (before && after) cam.center = [cam.center[0] + before[0] - after[0], cam.center[1] + before[1] - after[1]];
}
export const clampTilt = t => Math.min(TILT_MAX, Math.max(0, t));
