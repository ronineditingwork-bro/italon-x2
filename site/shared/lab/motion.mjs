// Движение и анимации лаборатории: функции времени без обращения к DOM — поэтому проверяются в Node.
import { skyAt, hourAt } from './timeofday.mjs';
export const clamp01 = x => Math.min(1, Math.max(0, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = t => 1 - Math.pow(1 - t, 3);

/** Положение света для режима и фазы (рад): центр вида + смещение, высота над поверхностью (см). */
export const LIGHT_PRESETS = {
  day: { r: 80, h: 70, phase: 2.2, speed: 0.22 },
  evening: { r: 42, h: 26, phase: 0.6, speed: 0.34 },
  side: { r: 95, h: 16, phase: 3.14, speed: 0.18 },
};
export function lightAt(mode, angle, heightK = 1) {
  const p = LIGHT_PRESETS[mode] || LIGHT_PRESETS.day;
  return { x: Math.cos(angle) * p.r, y: Math.sin(angle) * p.r * 0.7, h: Math.max(6, p.h * heightK) };
}

/** Переход A → B диагональной «шторкой света». Возвращает параметры для шейдера: шторка идёт слева направо, новый материал — слева от линии. */
export function sweepFor(progress, aspect, dir = [0.94, 0.34]) {
  const n = Math.hypot(dir[0], dir[1]), d = [dir[0] / n, dir[1] / n];
  const half = 0.5 * aspect * Math.abs(d[0]) + 0.5 * Math.abs(d[1]);
  const soft = 0.012 + 0.05 * Math.sin(Math.PI * clamp01(progress));          // кромка размывается к середине перехода
  const e = easeInOut(clamp01(progress));
  return { on: progress > 0 && progress < 1, pos: lerp(-half - soft, half + soft, e), dir: d, soft, line: false, glow: Math.sin(Math.PI * clamp01(progress)) };
}

/**
 * Сценарий короткого видео (по умолчанию 7 с): свет описывает дугу, камера медленно приближается и поворачивается,
 * в середине — переход к соседнему материалу. base — состояние лаборатории; возвращает новое состояние для времени t (с).
 */
export function choreograph(base, t, { duration = 7, aspect = 9 / 16, from = base.a, to = base.b } = {}) {
  const k = clamp01(t / duration), e = easeInOut(k);
  const s = JSON.parse(JSON.stringify(base));
  const preset = LIGHT_PRESETS[base.mode] || LIGHT_PRESETS.day;
  const ang = preset.phase + k * Math.PI * 1.35;
  s.light = base.mode === 'time' ? { ...base.light } : { ...lightAt(base.mode, ang) };
  if (base.mode === 'time') { const hr = hourAt(t, duration, 7, 22.5); s.hour = hr; s.sky = skyAt(hr); }
  s.cam.ppcm = base.cam.ppcm * lerp(0.92, 1.18, e);
  s.cam.rot = base.cam.rot + lerp(-0.05, 0.12, e);
  s.cam.tilt = Math.min(1.08, Math.max(0, base.cam.tilt + lerp(-0.04, 0.1, Math.sin(k * Math.PI))));
  s.cam.center = [base.cam.center[0] + lerp(-4, 6, e), base.cam.center[1] + lerp(0, 10, e)];
  s.a = from; s.b = to;
  const p = clamp01((k - 0.38) / 0.34);
  if (base.mode === 'time') { s.a = s.b = from; s.sweep = { on: false }; s.compare = false; return s; }
  if (from !== to) { s.sweep = sweepFor(p, aspect); if (p >= 1) { s.a = to; s.b = to; s.sweep = { on: false }; } if (p <= 0) { s.b = from; s.sweep = { on: false }; } }
  else s.sweep = { on: false };
  s.compare = false;
  return s;
}
