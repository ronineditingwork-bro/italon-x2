// X2 Outdoor Lab: маски поверхностей. Чистые функции над массивами пикселей (без DOM) — работают одинаково в браузере и в тестах Node.
// Маска зоны: контур-многоугольник (с вырезами-исключениями) → покрытие с мягким краем → по желанию уточнение по цвету (убирает траву, мебель, воду, попавшие в контур)
// → вычитание ручных исключений (кисть). Результат кладётся в каналы RGBA одной текстуры: до четырёх независимых поверхностей на кадр.

export const MAX_ZONES = 4;

/** Зона: внешний контур rings[0] минус вырезы rings[1..] (вырез может выходить за контур — лишнее не закрашивается). Возвращает Uint8Array w × h с мягким краем. */
export function fillRings(w, h, rings, sub = 4) {
  if (!rings.length) return new Uint8Array(w * h);
  const out = fillRing(w, h, [rings[0]], sub);
  for (let r = 1; r < rings.length; r++) {
    const hole = fillRing(w, h, [rings[r]], sub);
    for (let i = 0; i < out.length; i++) if (hole[i]) out[i] = Math.round(out[i] * (255 - hole[i]) / 255);
  }
  return out;
}
/** Заливка одного многоугольника по правилу чёт-нечет с подпиксельным сглаживанием. */
export function fillRing(w, h, rings, sub = 4) {
  const out = new Uint8Array(w * h), acc = new Float32Array(w);
  const edges = [];
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length];
    if (y0 !== y1) edges.push(y0 < y1 ? [x0, y0, x1, y1] : [x1, y1, x0, y0]);
  }
  if (!edges.length) return out;
  let minY = Infinity, maxY = -Infinity; for (const e of edges) { minY = Math.min(minY, e[1]); maxY = Math.max(maxY, e[3]); }
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(h - 1, Math.ceil(maxY));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    acc.fill(0);
    for (let k = 0; k < sub; k++) {
      const sy = y + (k + 0.5) / sub; xs.length = 0;
      for (const e of edges) if (sy >= e[1] && sy < e[3]) xs.push(e[0] + (sy - e[1]) * (e[2] - e[0]) / (e[3] - e[1]));
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        let a = Math.max(0, xs[i]), b = Math.min(w, xs[i + 1]); if (b <= a) continue;
        const ia = Math.floor(a), ib = Math.min(w - 1, Math.floor(b));
        if (ia === ib) acc[ia] += b - a; else { acc[ia] += ia + 1 - a; for (let x = ia + 1; x < ib; x++) acc[x] += 1; acc[ib] += b - ib; }
      }
    }
    for (let x = 0; x < w; x++) if (acc[x]) out[y * w + x] = Math.min(255, Math.round(acc[x] / sub * 255));
  }
  return out;
}

/** Размытие альфы окном (2r+1) — мягкий край покрытия. */
export function feather(mask, w, h, r = 1) {
  if (r < 1) return mask;
  const tmp = new Uint16Array(w * h), out = new Uint8Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += mask[y * w + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { tmp[y * w + x] = s; s += mask[y * w + Math.min(w - 1, x + r + 1)] - mask[y * w + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = Math.round(s / (n * n)); s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
  return out;
}

/**
 * Цвет поверхности под маской (0..1): берём самый «населённый» оттенок внутри контура (так трава или мебель, попавшие в обводку, не сбивают цвет),
 * а внутри него — середину по яркости (без бликов и глубоких теней). null, если пикселей мало.
 */
export function referenceColor(rgba, mask, w, h, { core = 200, sample = 3 } = {}) {
  const N = 40, bins = new Uint32Array(N * N), px = [];
  for (let y = 0; y < h; y += sample) for (let x = 0; x < w; x += sample) {
    const i = y * w + x; if (mask[i] < core) continue;
    const j = i * 4, r = rgba[j], g = rgba[j + 1], b = rgba[j + 2], s = r + g + b + 1;
    const bx = Math.min(N - 1, Math.floor(r / s * N)), by = Math.min(N - 1, Math.floor(g / s * N));
    bins[by * N + bx]++; px.push([r, g, b, r * 0.299 + g * 0.587 + b * 0.114, bx, by]);
  }
  if (px.length < 20) return null;
  let best = -1, bx0 = 0, by0 = 0;
  for (let by = 0; by < N; by++) for (let bx = 0; bx < N; bx++) {
    let t = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = bx + dx, y = by + dy; if (x >= 0 && y >= 0 && x < N && y < N) t += bins[y * N + x]; }
    if (t > best) { best = t; bx0 = bx; by0 = by; }
  }
  const sel = px.filter(p => Math.abs(p[4] - bx0) <= 1 && Math.abs(p[5] - by0) <= 1).sort((a, b) => a[3] - b[3]);
  if (sel.length < 10) return null;
  const lo = Math.floor(sel.length * 0.2), hi = Math.max(lo + 1, Math.ceil(sel.length * 0.8)); let r = 0, g = 0, b = 0, n = 0;
  for (let i = lo; i < hi; i++) { r += sel[i][0]; g += sel[i][1]; b += sel[i][2]; n++; }
  return [r / n / 255, g / n / 255, b / n / 255];
}

/**
 * Уточнение по цвету: оставляем пиксели, похожие на поверхность внутри контура (тот же оттенок и яркость в разумных пределах).
 * Убирает траву, растения, воду, дерево, мебель, если контур обведён неточно. strength 0..1 — доля влияния (0 — выключено).
 */
export function refineByColor(mask, rgba, w, h, ref, { tight = 0.05, loose = 0.1, lumLow = 0.35, lumHigh = 1.9 } = {}) {
  if (!ref) return mask;
  const out = new Uint8Array(mask), rs = ref[0] + ref[1] + ref[2] || 1e-6, rl = ref[0] * 0.299 + ref[1] * 0.587 + ref[2] * 0.114 || 1e-6, cr = ref[0] / rs, cg = ref[1] / rs;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const j = i * 4, r = rgba[j] / 255, g = rgba[j + 1] / 255, b = rgba[j + 2] / 255, s = r + g + b + 1e-6;
    const dc = Math.abs(r / s - cr) + Math.abs(g / s - cg), lum = (r * 0.299 + g * 0.587 + b * 0.114) / rl;
    let k = dc <= tight ? 1 : dc >= loose ? 0 : 1 - (dc - tight) / (loose - tight);
    if (lum < lumLow) k *= Math.max(0, lum / lumLow); else if (lum > lumHigh) k *= Math.max(0, 1 - (lum - lumHigh) / lumHigh);
    out[i] = Math.round(mask[i] * k);
  }
  return out;
}

/**
 * Маски всех зон кадра. zones: [{ rings: [[x, y], ...][], colorKey?: boolean }], rgba — пиксели фото (Uint8ClampedArray w × h × 4),
 * exclusion — необязательная маска ручных исключений (Uint8Array w × h; 255 — не покрывать).
 * Возвращает { data: Uint8Array w × h × 4 (канал = зона), refs: [[r, g, b] | null], pixels: [число пикселей зоны] }.
 */
export function buildZoneMasks(rgba, w, h, zones, { exclusion = null, featherRadius = 1 } = {}) {
  const data = new Uint8Array(w * h * 4), refs = [], pixels = [];
  zones.slice(0, MAX_ZONES).forEach((zone, zi) => {
    let m = fillRings(w, h, zone.rings || []);
    const ref = referenceColor(rgba, m, w, h);
    if (zone.colorKey !== false) m = refineByColor(m, rgba, w, h, ref, zone.colorOptions);
    if (exclusion) { const e = new Uint8Array(m); for (let i = 0; i < e.length; i++) e[i] = Math.round(m[i] * (255 - exclusion[i]) / 255); m = e; }
    m = feather(m, w, h, featherRadius);
    let n = 0; for (let i = 0; i < m.length; i++) { data[i * 4 + zi] = m[i]; if (m[i] >= 128) n++; }
    refs.push(referenceColor(rgba, m, w, h) || ref); pixels.push(n);
  });
  return { data, refs, pixels };
}
