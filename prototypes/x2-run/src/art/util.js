// Мелкие помощники для рисования на canvas 2D: скруглённые прямоугольники, цвета, градиенты, шум.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => t * t * (3 - 2 * t);
export const hash = (a, b = 0) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** Путь скруглённого прямоугольника (без заливки). r может быть числом или [tl,tr,br,bl]. */
export function rr(ctx, x, y, w, h, r = 4) {
  const [a, b, c, d] = Array.isArray(r) ? r : [r, r, r, r];
  ctx.beginPath();
  ctx.moveTo(x + a, y); ctx.lineTo(x + w - b, y); ctx.quadraticCurveTo(x + w, y, x + w, y + b);
  ctx.lineTo(x + w, y + h - c); ctx.quadraticCurveTo(x + w, y + h, x + w - c, y + h);
  ctx.lineTo(x + d, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - d);
  ctx.lineTo(x, y + a); ctx.quadraticCurveTo(x, y, x + a, y); ctx.closePath();
}

export function hex(c) {
  if (c.charCodeAt(0) === 114) { const m = c.match(/[\d.]+/g); return [+m[0], +m[1], +m[2]]; }       // 'rgb(...)' / 'rgba(...)'
  const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgb(r, g, b, a = 1) { return a >= 1 ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`; }
export function mix(c1, c2, t) { const a = hex(c1), b = hex(c2); return rgb(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)); }
export function shade(c, k) { const a = hex(c); return k >= 0 ? rgb(lerp(a[0], 255, k), lerp(a[1], 255, k), lerp(a[2], 255, k)) : rgb(a[0] * (1 + k), a[1] * (1 + k), a[2] * (1 + k)); }
export function alpha(c, a) { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; }

export function vgrad(ctx, y0, y1, stops) { const g = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach(([t, c]) => g.addColorStop(t, c)); return g; }
export function hgrad(ctx, x0, x1, stops) { const g = ctx.createLinearGradient(x0, 0, x1, 0); stops.forEach(([t, c]) => g.addColorStop(t, c)); return g; }
export function rgrad(ctx, x, y, r0, r1, stops) { const g = ctx.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([t, c]) => g.addColorStop(t, c)); return g; }

/** Мягкое свечение: радиальный градиент с аддитивным смешиванием. */
export const Q = { glow: true };
export function glow(ctx, x, y, r, color, a = 1) {
  if (!Q.glow) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgrad(ctx, x, y, 0, r, [[0, alpha(color, a)], [0.4, alpha(color, a * 0.35)], [1, alpha(color, 0)]]);
  ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
}

export function makeCanvas(w, h) {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (c) { c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); }
  return c;
}
/** Рисует один раз в отдельный canvas: drawFn(ctx) рисует в системе координат w×h (0,0 — левый верх). */
export function sprite(w, h, scale, drawFn) {
  const c = makeCanvas(w * scale, h * scale); const ctx = c.getContext('2d');
  ctx.scale(scale, scale); drawFn(ctx, w, h);
  return { canvas: c, w, h, scale };
}
export function blit(ctx, s, x, y, flip = false, a = 1) {
  if (a !== 1) { ctx.save(); ctx.globalAlpha *= a; }
  if (flip) { ctx.save(); ctx.translate(x + s.w, y); ctx.scale(-1, 1); ctx.drawImage(s.canvas, 0, 0, s.w, s.h); ctx.restore(); }
  else ctx.drawImage(s.canvas, x, y, s.w, s.h);
  if (a !== 1) ctx.restore();
}
