// Дорожка: «старое» покрытие впереди, новая мраморная плитка позади робота, ямы (траншеи и вода), названия брендов, уступы.
// Покрытие рисуется под небольшим наклоном: верх плиты сдвинут вправо, как на концепт-арте.
import { CONFIG } from '../config.js';
import { TAU, rr, vgrad, hgrad, rgrad, glow, alpha, mix, shade, lerp, clamp, hash, makeCanvas, smooth } from './util.js';

export const BAND = { far: -62, near: 34, face: 24, slope: 0.29 };
const TL = CONFIG.lay.tileLen;
const BRAND_TINT = { 'Kerama Marazzi': '#d9a982', 'Atlas Concorde': '#7f8793', 'Estima': '#d2b997', 'FMG': '#5a5e66', 'Rex': '#b98c80', 'VitrA': '#aab4b8', 'Laparet': '#b9ae9a', 'Idalgo': '#9ba39a' };

function noiseTile(size, draw) { const c = makeCanvas(size, size), x = c.getContext('2d'); draw(x, size); return c; }

function marbleCanvas(S) {
  return noiseTile(256, (x, n) => {
    x.fillStyle = '#efece6'; x.fillRect(0, 0, n, n);
    const blob = (cnt, r0, r1, rgb, a) => { for (let i = 0; i < cnt; i++) { const px = Math.random() * n, py = Math.random() * n, r = r0 + Math.random() * (r1 - r0); for (const [ox, oy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) { const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r); g.addColorStop(0, `rgba(${rgb},${Math.random() * a})`); g.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = g; x.fillRect(px + ox - r, py + oy - r, r * 2, r * 2); } } };
    blob(18, 30, 110, '176,172,166', 0.2); blob(12, 30, 90, '255,255,255', 0.45); blob(8, 60, 130, '214,196,170', 0.18);
    x.lineCap = 'round';
    const vein = (cnt, rgb, a, w) => { for (let i = 0; i < cnt; i++) { let px = Math.random() * n, py = Math.random() * n, ang = Math.random() * TAU; x.strokeStyle = `rgba(${rgb},${0.1 + Math.random() * a})`; x.lineWidth = 0.5 + Math.random() * w; x.beginPath(); x.moveTo(px, py); for (let s = 0; s < 10; s++) { ang += (Math.random() - 0.5) * 1.1; px += Math.cos(ang) * (8 + Math.random() * 18); py += Math.sin(ang) * (8 + Math.random() * 18); x.lineTo(px, py); } x.stroke(); } };
    vein(5, '150,146,142', 0.22, 1.5); vein(10, '255,255,255', 0.5, 2.6); vein(10, '168,160,150', 0.14, 0.7);
  });
}
function speckleCanvas() {
  return noiseTile(256, (x, n) => {
    for (let i = 0; i < 2600; i++) { const v = Math.random() < 0.5 ? 40 + Math.random() * 50 : 210 + Math.random() * 45; x.fillStyle = `rgba(${v},${v},${v},${0.1 + Math.random() * 0.22})`; x.fillRect(Math.random() * n, Math.random() * n, 1 + Math.random() * 2, 1 + Math.random() * 2); }
    for (let i = 0; i < 6; i++) { x.strokeStyle = 'rgba(20,20,24,0.18)'; x.lineWidth = 1; let px = Math.random() * n, py = Math.random() * n; x.beginPath(); x.moveTo(px, py); for (let s = 0; s < 5; s++) { px += (Math.random() - 0.5) * 30; py += (Math.random() - 0.5) * 30; x.lineTo(px, py); } x.stroke(); }
  });
}

export class Ground {
  constructor(scale) {
    this.S = scale;
    this.marbleImg = marbleCanvas(scale); this.speckleImg = speckleCanvas();
    this.patterns = null;
  }

  sk(GY, y) { return -(y - GY) * BAND.slope; }

  pat(ctx, img, ox, scaleX = 1) {
    if (!this.patterns) this.patterns = new Map();
    let p = this.patterns.get(img);
    if (!p) { p = ctx.createPattern(img, 'repeat'); this.patterns.set(img, p); }
    if (p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().translate(-ox, 0).scale(scaleX));
    return p;
  }

  /** Параллелограмм полосы от x0 до x1 (в экранных координатах на линии ног). */
  band(ctx, GY, x0, x1, y0 = BAND.far, y1 = BAND.near) {
    ctx.beginPath(); ctx.moveTo(x0 + this.sk(GY, GY + y0), GY + y0); ctx.lineTo(x1 + this.sk(GY, GY + y0), GY + y0); ctx.lineTo(x1 + this.sk(GY, GY + y1), GY + y1); ctx.lineTo(x0 + this.sk(GY, GY + y1), GY + y1); ctx.closePath();
  }

  draw(ctx, W, H, GY, camX, game, laidX, t) {
    const L = CONFIG.zoneLen, zs = CONFIG.zones, far = GY + BAND.far, near = GY + BAND.near, face = near + BAND.face;
    const i0 = Math.floor((camX - 60) / TL) - 1, i1 = Math.ceil((camX + W + 80) / TL) + 1;
    const patches = game.level.patches;

    // ---- старое покрытие плитками ----
    ctx.save();
    for (let i = i0; i <= i1; i++) {
      const wx = i * TL, z = clamp(Math.floor(wx / L), 0, zs.length - 1), zn = zs[z];
      let tint = null; for (const p of patches) if (wx + TL > p.x0 && wx < p.x1) { tint = BRAND_TINT[p.brand] || '#a09a8b'; break; }
      for (let k = 0; k < 4; k++) {
        const y0 = far + (near - far) * (k / 4), y1 = far + (near - far) * ((k + 1) / 4);
        const x0 = wx - camX, x1 = x0 + TL, s0 = this.sk(GY, y0), s1 = this.sk(GY, y1);
        let c = mix(zn.oldA, zn.oldB, hash(i, k) * 0.9 + (((i + k) & 1) ? 0.2 : 0));
        if (tint) c = mix(c, tint, 0.7);
        c = shade(c, (k - 1.5) * 0.045 + (hash(i * 3, k + 5) - 0.5) * 0.06);
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.moveTo(x0 + s0, y0); ctx.lineTo(x1 + s0, y0); ctx.lineTo(x1 + s1, y1); ctx.lineTo(x0 + s1, y1); ctx.closePath(); ctx.fill();
      }
    }
    // зерно и трещины
    ctx.globalAlpha = 0.85; this.band(ctx, GY, -80, W + 80); ctx.fillStyle = this.pat(ctx, this.speckleImg, camX, 1 / this.S); ctx.fill(); ctx.globalAlpha = 1;
    // названия брендов лежат на покрытии
    for (const p of patches) {
      const cx = (p.x0 + p.x1) / 2 - camX; if (cx < -400 || cx > W + 400) continue;
      ctx.save(); ctx.translate(cx + this.sk(GY, GY - 8), GY - 6); ctx.transform(1, 0, -BAND.slope, 0.5, 0, 0);
      ctx.font = '800 54px "Segoe UI", "Bahnschrift", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillText(p.brand, 2, 3); ctx.fillStyle = 'rgba(24,26,30,0.62)'; ctx.fillText(p.brand, 0, 0);
      ctx.restore();
    }
    // швы
    this.seams(ctx, GY, i0, i1, camX, W, false);
    // лицевая грань: торец плитки
    ctx.fillStyle = vgrad(ctx, near, face, [[0, '#6f7279'], [1, '#3e4147']]); ctx.fillRect(-10, near, W + 20, BAND.face);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-10, near, W + 20, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = i0; i <= i1; i++) ctx.fillRect(i * TL - camX + this.sk(GY, near) - 1, near, 2.4, BAND.face);
    // основание
    ctx.fillStyle = vgrad(ctx, face, H, [[0, '#4a3a2e'], [0.25, '#2e241d'], [1, '#14100c']]); ctx.fillRect(-10, face, W + 20, H - face + 10);
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 40; i++) { const sx = (hash(i, 7) * (W + 600)) - ((camX * 1.0) % (W + 600)); ctx.fillRect(((sx % (W + 600)) + W + 600) % (W + 600) - 300, face + hash(i, 9) * (H - face), 14 + hash(i, 4) * 40, 2); }
    ctx.restore();

    // ---- новая плитка позади робота ----
    const lx = laidX - camX;
    if (lx > -100) {
      ctx.save();
      this.band(ctx, GY, -300, lx);
      ctx.clip();
      this.band(ctx, GY, -300, lx);
      ctx.fillStyle = '#efe9dd'; ctx.fill();
      ctx.fillStyle = this.pat(ctx, this.marbleImg, camX, 1 / this.S); ctx.fill();
      for (let i = i0; i <= i1; i++) for (let k = 0; k < 4; k++) {
        const y0 = far + (near - far) * (k / 4), y1 = far + (near - far) * ((k + 1) / 4), x0 = i * TL - camX, x1 = x0 + TL, s0 = this.sk(GY, y0), s1 = this.sk(GY, y1);
        const dv = (hash(i + 40, k * 3) - 0.5) * 0.16 + (k - 1.5) * 0.018;
        ctx.fillStyle = dv > 0 ? `rgba(255,248,235,${dv})` : `rgba(80,70,55,${-dv * 0.8})`;
        ctx.beginPath(); ctx.moveTo(x0 + s0, y0); ctx.lineTo(x1 + s0, y0); ctx.lineTo(x1 + s1, y1); ctx.lineTo(x0 + s1, y1); ctx.closePath(); ctx.fill();
      }
      // тёплое скольжение света по глянцу
      const gx = ((t * 160) % (W + 600)) - 300;
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = hgrad(ctx, gx - 160, gx + 160, [[0, 'rgba(255,230,180,0)'], [0.5, 'rgba(255,230,180,0.2)'], [1, 'rgba(255,230,180,0)']]); ctx.fillRect(gx - 160, far, 320, near - far);
      ctx.globalCompositeOperation = 'source-over';
      this.seams(ctx, GY, i0, i1, camX, W, true);
      // торец новой плитки
      ctx.fillStyle = vgrad(ctx, near, face, [[0, '#f4eee0'], [1, '#b9ae98']]); ctx.fillRect(-300, near, W + 400, BAND.face);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-300, near, W + 400, 2.4);
      ctx.fillStyle = 'rgba(90,80,62,0.35)'; for (let i = i0; i <= i1; i++) ctx.fillRect(i * TL - camX + this.sk(GY, near) - 1, near, 2, BAND.face);
      // свежая кромка: вспышка у границы укладки
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = hgrad(ctx, lx - 70, lx + 10, [[0, 'rgba(255,225,160,0)'], [1, 'rgba(255,225,160,0.55)']]); ctx.fillRect(lx - 70, far - 4, 90, near - far + BAND.face + 6);
      ctx.restore();
    }

    // ---- ямы ----
    for (const g of game.level.gaps) {
      const gx0 = g.x0 - camX, gx1 = g.x1 - camX; if (gx1 < -60 || gx0 > W + 60) continue;
      this.drawGap(ctx, W, H, GY, g, gx0, gx1, t);
    }
  }

  seams(ctx, GY, i0, i1, camX, W, fresh) {
    const far = GY + BAND.far, near = GY + BAND.near;
    ctx.lineCap = 'butt';
    const dark = fresh ? 'rgba(120,108,88,0.5)' : 'rgba(10,10,14,0.5)', light = fresh ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.12)';
    for (let k = 0; k <= 4; k++) {
      const y = far + (near - far) * (k / 4);
      ctx.fillStyle = dark; ctx.fillRect(-20, y - 0.9, W + 40, 1.8); ctx.fillStyle = light; ctx.fillRect(-20, y + 0.9, W + 40, 1.1);
    }
    for (let i = i0; i <= i1; i++) {
      const x = i * TL - camX;
      ctx.strokeStyle = dark; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x + this.sk(GY, far), far); ctx.lineTo(x + this.sk(GY, near), near); ctx.stroke();
      ctx.strokeStyle = light; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(x + 1.6 + this.sk(GY, far), far); ctx.lineTo(x + 1.6 + this.sk(GY, near), near); ctx.stroke();
    }
  }

  drawGap(ctx, W, H, GY, g, x0, x1, t) {
    const far = GY + BAND.far, near = GY + BAND.near, face = near + BAND.face;
    ctx.save();
    const sF = this.sk(GY, far), sN = this.sk(GY, near);
    // вырез по форме параллелограмма, продолженный вниз
    ctx.beginPath(); ctx.moveTo(x0 + sF, far); ctx.lineTo(x1 + sF, far); ctx.lineTo(x1 + sN, near); ctx.lineTo(x1 + sN, face + 4); ctx.lineTo(x0 + sN, face + 4); ctx.lineTo(x0 + sN, near); ctx.closePath(); ctx.clip();
    if (g.kind === 'water') {
      ctx.fillStyle = vgrad(ctx, far, face, [[0, '#6fe0e8'], [0.5, '#2fb2c9'], [1, '#12708f']]); ctx.fillRect(x0 - 20, far - 4, x1 - x0 + 80, face - far + 8);
      ctx.strokeStyle = 'rgba(225,252,255,0.55)'; ctx.lineWidth = 1.6;
      for (let r = 0; r < 4; r++) { const y = far + 10 + r * 20; ctx.beginPath(); for (let x = x0 - 10; x <= x1 + 50; x += 8) { const yy = y + Math.sin((x + t * 90) * 0.06 + r) * 2.6; x === x0 - 10 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); } ctx.stroke(); }
      ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 9; i++) { const bx = x0 + ((hash(i, 3) * 160 + t * 20 * (1 + i % 3)) % (x1 - x0 + 60)); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.ellipse(bx, far + 14 + hash(i, 8) * (near - far), 16, 3, 0, 0, TAU); ctx.fill(); }
    } else {
      ctx.fillStyle = vgrad(ctx, far, face, [[0, '#4a382a'], [0.4, '#2c2018'], [1, '#0f0b08']]); ctx.fillRect(x0 - 20, far - 4, x1 - x0 + 80, face - far + 8);
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 14; i++) ctx.fillRect(x0 + hash(i, 1) * (x1 - x0), far + hash(i, 2) * (face - far), 10 + hash(i, 5) * 20, 2);
      // арматура и труба в траншее
      ctx.fillStyle = '#6b5a4a'; rr(ctx, x0 + 20, near - 8, x1 - x0 - 40, 10, 5); ctx.fill();
    }
    ctx.restore();
    // кромки: камень или земля
    for (const [ex, sgn] of [[x0, -1], [x1, 1]]) {
      ctx.fillStyle = g.kind === 'water' ? '#efe8d8' : '#8a8e96';
      ctx.beginPath(); ctx.moveTo(ex + sF - sgn * 3, far); ctx.lineTo(ex + sF + sgn * 7, far); ctx.lineTo(ex + sN + sgn * 7, near); ctx.lineTo(ex + sN - sgn * 3, near); ctx.closePath(); ctx.fill();
      ctx.fillStyle = g.kind === 'water' ? '#d6ccb6' : '#4c4f56'; ctx.fillRect(ex + sN - (sgn > 0 ? -1 : 8), near, 8, BAND.face);
    }
    // ограждение: столбики и лента (в траншеях)
    if (g.kind !== 'water') {
      const y = GY - 18;
      for (const ex of [x0 - 14, x1 + 14]) { ctx.fillStyle = '#2a2d33'; rr(ctx, ex - 2, y - 40, 5, 54, 2); ctx.fill(); ctx.fillStyle = '#f2b62b'; ctx.fillRect(ex - 3, y - 40, 7, 6); }
      ctx.strokeStyle = '#d63b2c'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x0 - 14, y - 30); ctx.lineTo(x1 + 14, y - 30); ctx.stroke();
      ctx.strokeStyle = '#f6f1e6'; ctx.setLineDash([10, 10]); ctx.lineDashOffset = 0; ctx.beginPath(); ctx.moveTo(x0 - 14, y - 30); ctx.lineTo(x1 + 14, y - 30); ctx.stroke(); ctx.setLineDash([]);
    }
  }
}
