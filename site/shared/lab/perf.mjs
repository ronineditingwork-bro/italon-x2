// Уровни производительности лаборатории и адаптация «на лету». Чистая логика — проверяется в Node (tests/lab.test.mjs).
//   tier: 'high' | 'medium' | 'low' (WebGL, упрощённый) | 'fallback' (Canvas 2D, если WebGL недоступен или слишком слаб)
export function detectTier({ webgl2 = true, mobile = false, cores = 8, memory = 8, renderer = '', maxTexture = 8192, reducedMotion = false, saveData = false, forceLite = false } = {}) {
  if (!webgl2) return { tier: 'fallback', reason: 'нет WebGL 2' };
  if (forceLite) return { tier: 'low', reason: 'включён лёгкий режим' };
  const soft = /swiftshader|llvmpipe|software|basic render/i.test(renderer);
  if (soft) return { tier: 'low', reason: 'программная графика' };
  if (maxTexture < 4096) return { tier: 'low', reason: 'ограниченная графика' };
  if (/Mali-[T4]|Adreno \(TM\) [23]\d\d|PowerVR SGX|Intel\(R\) HD Graphics [23]/i.test(renderer)) return { tier: 'low', reason: 'слабый графический чип' };
  if (saveData || memory <= 2 || cores <= 2) return { tier: 'low', reason: 'мало ресурсов устройства' };
  if (mobile && (memory <= 4 || cores <= 4)) return { tier: 'medium', reason: 'мобильное устройство' };
  if (mobile) return { tier: 'medium', reason: 'мобильное устройство' };
  return { tier: 'high', reason: '' };
}
// Уровни качества: renderScale — доля разрешения холста, q — 0 полное (тени рельефа, зерно, отражения), 1 без теней, 2 упрощённое
export const LEVELS = [
  { scale: 1, q: 0, aniso: 8, tex: 1024 },
  { scale: 0.85, q: 0, aniso: 4, tex: 1024 },
  { scale: 0.7, q: 1, aniso: 2, tex: 1024 },
  { scale: 0.55, q: 2, aniso: 1, tex: 512 },
  { scale: 0.42, q: 2, aniso: 1, tex: 512 },
];
export const START_LEVEL = { high: 0, medium: 1, low: 3, fallback: 4 };
/** Следит за временем кадра: при устойчивой медленной работе снижает уровень, при устойчивой быстрой — осторожно повышает. */
export class Adaptive {
  constructor(level = 0, { slowMs = 34, fastMs = 15, slowFrames = 40, fastFrames = 240, min = 0, max = LEVELS.length - 1, cooldown = 60 } = {}) {
    Object.assign(this, { level, slowMs, fastMs, slowFrames, fastFrames, min, max, cooldown }); this.slow = 0; this.fast = 0; this.wait = 0; this.history = [];
  }
  push(ms) {
    if (this.wait > 0) { this.wait--; return null; }
    if (ms > this.slowMs) { this.slow++; this.fast = 0; } else if (ms < this.fastMs) { this.fast++; this.slow = Math.max(0, this.slow - 1); } else { this.slow = Math.max(0, this.slow - 1); this.fast = Math.max(0, this.fast - 1); }
    if (this.slow >= this.slowFrames && this.level < this.max) { this.level++; return this.#changed('down'); }
    if (this.fast >= this.fastFrames && this.level > this.min) { this.level--; return this.#changed('up'); }
    return null;
  }
  #changed(dir) { this.slow = this.fast = 0; this.wait = this.cooldown; this.history.push([dir, this.level]); return { dir, level: this.level, ...LEVELS[this.level] }; }
}
