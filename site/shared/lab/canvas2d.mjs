// Запасной режим без WebGL 2: вид сверху на плитку с условной подсветкой на Canvas 2D. Наклона и теней рельефа здесь нет —
// это сознательное упрощение для устройств, где настоящий рендер недоступен или слишком медленный.
import { basis } from './camera.mjs';
import { BONDS, JOINT_COLORS, rowShift } from './layout.mjs';
import { hash2, HASH_OFFSET } from './layout.mjs';

const eff0 = st => (st.mode === 'time' ? (st.sky?.key === 'sun' && st.sky.hour > 7 && st.sky.hour < 17.5 ? 'day' : 'evening') : st.mode);
const TINT = { day: 'rgba(255,244,225,', evening: 'rgba(255,150,70,', side: 'rgba(235,242,255,' };
export class Canvas2DView {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false }); this.sources = []; this.level = 4; this.info = { renderer: 'Canvas 2D', maxTexture: 0 }; this.fallback = true; }
  setMaterials(materials) { this.sources = [materials[0], materials[1] || materials[0]]; }
  setSlots(materials) { this.setMaterials(materials); }
  prepare() {}
  setLevel() {}
  finish() {}
  dispose() {}
  #tiles(g, mat, state, W, H, ppcm, clipX) {
    const cam = state.cam, b = basis({ ...cam, tilt: 0 }), { w, h } = state.tile, joint = state.joint;
    const bond = BONDS.find(x => x.id === state.bond)?.mode ?? 0, px = w + joint, py = h + joint;
    const half = Math.hypot(W, H) / 2 / ppcm + Math.max(w, h);
    const x0 = cam.center[0] - half, x1 = cam.center[0] + half, y0 = cam.center[1] - half, y1 = cam.center[1] + half;
    const r0 = Math.floor(y0 / py), r1 = Math.ceil(y1 / py);
    if ((r1 - r0) * ((x1 - x0) / px + 2) > 2600) return;
    const jc = JOINT_COLORS.find(x => x.id === state.jointColor) || JOINT_COLORS[0];
    g.save(); if (clipX) { g.beginPath(); g.rect(clipX[0], 0, clipX[1] - clipX[0], H); g.clip(); }
    g.setTransform(ppcm * b.R[0], -ppcm * b.R[1], ppcm * b.U[0] * -1 * -1, 0, 0, 0);
    g.restore(); g.save(); if (clipX) { g.beginPath(); g.rect(clipX[0], 0, clipX[1] - clipX[0], H); g.clip(); }
    // плоскость (x, y) см → пиксели: x' = W/2 + ppcm·R·(p−c), y' = H/2 − ppcm·U·(p−c)
    const m = [ppcm * b.R[0], -ppcm * b.U[0], ppcm * b.R[1], -ppcm * b.U[1]];
    const ox = W / 2 - (m[0] * cam.center[0] + m[2] * cam.center[1]), oy = H / 2 - (m[1] * cam.center[0] + m[3] * cam.center[1]);
    g.setTransform(m[0], m[1], m[2], m[3], ox, oy);
    if (state.wall) { const r = state.wall.rect; g.beginPath(); g.rect(r[0], r[1], r[2] - r[0], r[3] - r[1]); g.clip(); }
    g.fillStyle = jc.color || '#' + mat.avgHex; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    const img = mat.source, iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
    for (let row = r0; row <= r1; row++) {
      const shift = rowShift(bond, row) * px, c0 = Math.floor((x0 - shift) / px), c1 = Math.ceil((x1 - shift) / px);
      for (let col = c0; col <= c1; col++) {
        const tx = col * px + shift + joint / 2, ty = row * py + joint / 2;
        const c = col + HASH_OFFSET, r = row + HASH_OFFSET, a = hash2(c, r), bb = hash2(c + 7919, r + 104729), cc = hash2(r * 31 + 5, c * 17 + 3), dd = hash2(c ^ 23505, r ^ 112755);
        const sw = Math.min(1, w / mat.photo[0]), sh = Math.min(1, h / mat.photo[1]);
        const vary = !state.wall; g.save();
        if (state.turn) {                            // плита повёрнута: рисунок поворачивается на 90° против часовой стрелки, а не растягивается
          g.translate(tx, ty + h); g.scale(1, -1); g.translate(0, h); g.rotate(-Math.PI / 2); g.drawImage(img, 0, 0, iw, ih, 0, 0, h, w);
        } else {
          g.translate(tx + (vary && a > 0.5 ? w : 0), ty + (vary && bb > 0.5 ? 0 : h)); g.scale(vary && a > 0.5 ? -1 : 1, vary && bb > 0.5 ? 1 : -1);
          g.drawImage(img, vary ? cc * (1 - sw) * iw : 0, vary ? dd * (1 - sh) * ih : 0, sw * iw, sh * ih, 0, 0, w, h);
        }
        g.restore();
      }
    }
    g.restore();
  }
  render(state, { cssWidth = this.canvas.clientWidth || this.canvas.width } = {}) {
    const g = this.ctx, W = this.canvas.width, H = this.canvas.height, ppcm = state.cam.ppcm * (W / cssWidth);
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, W, H);
    const A = this.sources[state.a], B = this.sources[state.b], sw = state.sweep?.on ? state.sweep : null;
    if (!A) return;
    if (sw && B) {
      const aspect = W / H, d = sw.dir || [1, 0], k = (W / 2) / Math.max(0.0001, d[0]);   // положение линии по оси x (упрощённо: вертикальная шторка)
      const x = W / 2 + sw.pos * H * (d[0] > 0.5 ? 1 / Math.max(d[0], 0.5) : 1) * 0.98 * (aspect / aspect);
      this.#tiles(g, A, state, W, H, ppcm, [x, W]); this.#tiles(g, B, state, W, H, ppcm, [0, x]);
      g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = `rgba(255,236,205,${0.2 + 0.5 * (sw.glow || 0)})`; g.fillRect(x - 1, 0, 2, H); void k;
    } else this.#tiles(g, A, state, W, H, ppcm, null);
    g.setTransform(1, 0, 0, 1, 0, 0);
    // условный свет: пятно вокруг положения источника и затемнение остального
    const lx = W / 2 + (state.light.x) * ppcm * 0.9, ly = H / 2 - (state.light.y) * ppcm * 0.9, R = Math.hypot(W, H) * (eff0(state) === 'evening' ? 0.5 : 0.8);
    const eff = state.mode === 'time' ? (state.sky?.key === 'sun' && state.sky.hour > 7 && state.sky.hour < 17.5 ? 'day' : 'evening') : state.mode, tint = TINT[eff] || TINT.day;
    g.globalCompositeOperation = 'multiply'; let grad = g.createRadialGradient(lx, ly, R * 0.05, lx, ly, R);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, eff0(state) === 'day' ? 'rgba(150,150,160,1)' : 'rgba(35,35,45,1)'); g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'screen'; grad = g.createRadialGradient(lx, ly, 0, lx, ly, R * 0.55); grad.addColorStop(0, tint + '0.45)'); grad.addColorStop(1, tint + '0)'); g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
  }
}
