// Все текстуры рисуются на canvas при запуске: внешних картинок нет.
import * as THREE from '../../vendor/three.module.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function diamond(ctx, cx, cy, r, line, color) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath();
  ctx.lineWidth = line; ctx.strokeStyle = color; ctx.lineJoin = 'round'; ctx.stroke();
}

/** Крафтовый картон: чёрный ромб и крупная надпись X2. */
export function kraftTexture({ label = true } = {}) {
  const c = canvas(512, 512), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#d29a55'); g.addColorStop(1, '#bf8845');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) { // волокна картона
    ctx.fillStyle = `rgba(${90 + Math.random() * 40},${60 + Math.random() * 30},30,${Math.random() * 0.07})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 22, 1);
  }
  ctx.strokeStyle = 'rgba(70,45,20,0.35)'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, 506, 506);
  if (label) {
    diamond(ctx, 256, 262, 168, 22, '#17181a');
    ctx.fillStyle = '#17181a'; ctx.font = '900 150px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('X2', 256, 270);
  }
  // скотч сверху
  ctx.fillStyle = 'rgba(235,215,170,0.35)'; ctx.fillRect(0, 232, 512, 0);
  return tex(c);
}

/** Маркировка X2 на новой плитке (ромб с надписью), полупрозрачная. */
export function x2DecalTexture() {
  const c = canvas(256, 256), ctx = c.getContext('2d');
  diamond(ctx, 128, 128, 84, 9, 'rgba(45,45,48,0.62)');
  ctx.fillStyle = 'rgba(45,45,48,0.62)'; ctx.font = '900 76px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('X2', 128, 134);
  return tex(c);
}

/** Название бренда на старом покрытии. Текст лежит на земле, читается из-за спины робота. */
export function brandLabelTexture(text) {
  const c = canvas(1024, 256), ctx = c.getContext('2d');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let size = 128;
  ctx.font = `800 ${size}px "Segoe UI", Arial, sans-serif`;
  while (ctx.measureText(text).width > 940 && size > 40) { size -= 6; ctx.font = `800 ${size}px "Segoe UI", Arial, sans-serif`; }
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillText(text, 514, 134);
  ctx.fillStyle = 'rgba(28,31,36,0.78)'; ctx.fillText(text, 512, 128);
  return tex(c);
}

/** Мягкое свечение для глаз и искр. */
export function glowTexture(inner = 'rgba(255,236,170,1)', mid = 'rgba(255,190,80,0.5)') {
  const c = canvas(128, 128), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(0.35, mid); g.addColorStop(1, 'rgba(255,170,60,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return tex(c);
}

/** Разметка парковки и мелкий шум асфальта. */
export function noiseTexture(base = '#777', amount = 24, size = 256) {
  const c = canvas(size, size), ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 14; i++) {
    const v = Math.floor(128 + (Math.random() - 0.5) * amount * 2);
    ctx.fillStyle = `rgba(${v},${v},${v},0.13)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  return tex(c, { repeat: true });
}

// ---------- поверхности ----------
function blobs(ctx, size, n, rMin, rMax, rgb, aMax) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = rMin + Math.random() * (rMax - rMin);
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      const a = Math.random() * aMax;
      g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
}
function veins(ctx, size, n, rgb, aMax, wMax) {
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let x = Math.random() * size, y = Math.random() * size, ang = Math.random() * Math.PI * 2;
    const w = 0.5 + Math.random() * wMax, a = 0.1 + Math.random() * aMax, steps = 8 + (Math.random() * 14 | 0);
    ctx.strokeStyle = `rgba(${rgb},${a})`; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < steps; s++) { ang += (Math.random() - 0.5) * 1.1; x += Math.cos(ang) * (10 + Math.random() * 26); y += Math.sin(ang) * (10 + Math.random() * 26); ctx.lineTo(x, y); }
    ctx.stroke();
  }
}

/** Светлый мрамор с прожилками: новая плитка X2. Серая шкала — цвет задаётся на экземпляре. */
export function marbleTexture() {
  const S = 512, c = canvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = '#e9e7e3'; ctx.fillRect(0, 0, S, S);
  blobs(ctx, S, 26, 60, 190, '170,168,166', 0.26);
  blobs(ctx, S, 18, 50, 150, '255,255,255', 0.5);
  veins(ctx, S, 14, '120,118,118', 0.5, 2.2);
  veins(ctx, S, 26, '255,255,255', 0.55, 3);
  veins(ctx, S, 40, '140,138,138', 0.28, 0.9);
  const t = tex(c, { repeat: true }); t.anisotropy = 8; return t;
}

/** Крупнозернистый керамогранит — «старое» покрытие, цвет задаётся на экземпляре. */
export function graniteTexture() {
  const S = 512, c = canvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = '#b9b9b9'; ctx.fillRect(0, 0, S, S);
  blobs(ctx, S, 40, 40, 140, '90,90,90', 0.18);
  blobs(ctx, S, 30, 40, 120, '235,235,235', 0.2);
  for (let i = 0; i < 5200; i++) {
    const v = Math.random() < 0.5 ? 60 + Math.random() * 40 : 215 + Math.random() * 40;
    ctx.fillStyle = `rgba(${v},${v},${v},${0.18 + Math.random() * 0.3})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 2.4, 1 + Math.random() * 2.4);
  }
  veins(ctx, S, 7, '80,80,80', 0.18, 1.2);
  const t = tex(c, { repeat: true }); t.anisotropy = 8; return t;
}

/** Большие плиты площадки рядом с дорожкой: швы и лёгкая неровность. */
export function plazaTexture() {
  const S = 512, c = canvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = '#cfc9bd'; ctx.fillRect(0, 0, S, S);
  blobs(ctx, S, 30, 50, 160, '120,115,105', 0.12);
  blobs(ctx, S, 24, 50, 130, '255,250,240', 0.22);
  veins(ctx, S, 8, '130,125,118', 0.2, 1.4);
  ctx.fillStyle = 'rgba(70,66,60,0.55)'; ctx.fillRect(0, 0, S, 3); ctx.fillRect(0, 0, 3, S);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, 3, S, 2); ctx.fillRect(3, 0, 2, S);
  ctx.fillStyle = 'rgba(70,66,60,0.45)'; ctx.fillRect(0, S / 2, S, 2); ctx.fillRect(S / 2, 0, 2, S);
  const t = tex(c, { repeat: true }); t.anisotropy = 8; return t;
}

/** Асфальт парковки. */
export function asphaltTexture() {
  const S = 512, c = canvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = '#4d5055'; ctx.fillRect(0, 0, S, S);
  blobs(ctx, S, 40, 40, 150, '20,20,24', 0.2);
  blobs(ctx, S, 30, 40, 120, '120,124,130', 0.12);
  for (let i = 0; i < 9000; i++) {
    const v = 70 + Math.random() * 120;
    ctx.fillStyle = `rgba(${v},${v},${v + 4},${0.1 + Math.random() * 0.25})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 1.8, 1 + Math.random() * 1.8);
  }
  const t = tex(c, { repeat: true }); t.anisotropy = 8; return t;
}

/** Декоративный щебень клумб. */
export function gravelTexture() {
  const S = 256, c = canvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = '#6d6a64'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const v = 70 + Math.random() * 110, r = 1.2 + Math.random() * 2.6;
    ctx.fillStyle = `rgb(${v},${v - 2},${v - 6})`; ctx.beginPath(); ctx.ellipse(Math.random() * S, Math.random() * S, r, r * 0.8, Math.random() * 3, 0, 7); ctx.fill();
  }
  return tex(c, { repeat: true });
}

/** Газон. */
export function lawnTexture() {
  const S = 256, c = canvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = '#62803f'; ctx.fillRect(0, 0, S, S);
  blobs(ctx, S, 40, 30, 90, '40,80,30', 0.3);
  blobs(ctx, S, 30, 30, 90, '160,190,90', 0.2);
  for (let i = 0; i < 3500; i++) {
    ctx.strokeStyle = `rgba(${60 + Math.random() * 60},${110 + Math.random() * 60},${30 + Math.random() * 40},0.35)`;
    const x = Math.random() * S, y = Math.random() * S; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (Math.random() - 0.5) * 4, y - 3 - Math.random() * 4); ctx.stroke();
  }
  return tex(c, { repeat: true });
}

/** Тени листвы: россыпи мелких листьев сгустками, между ними пятна света. Прозрачный слой поверх покрытия. */
export function leafShadowTexture() {
  const S = 512, c = canvas(S, S), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  const two = Math.PI * 2, ph = [Math.random() * 6, Math.random() * 6, Math.random() * 6, Math.random() * 6];
  const density = (x, y) => {                                             // периодичная гладкая карта «где крона гуще»
    const u = x / S * two, v = y / S * two;
    return 0.5 + 0.25 * Math.sin(u * 2 + ph[0]) * Math.cos(v + ph[1]) + 0.25 * Math.sin(v * 3 + u + ph[2]) * Math.cos(u * 2 + ph[3]);
  };
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * S, y = Math.random() * S, d = density(x, y);
    if (Math.random() > d * d * 1.5) continue;
    const r = 4 + Math.random() * 11, a = 0.16 + Math.random() * 0.3, rot = Math.random() * 3.1;
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S], [S, S], [-S, -S], [S, -S], [-S, S]]) {
      if (x + ox < -20 || x + ox > S + 20 || y + oy < -20 || y + oy > S + 20) continue;
      ctx.fillStyle = `rgba(22,30,42,${a})`; ctx.beginPath(); ctx.ellipse(x + ox, y + oy, r, r * 0.55, rot, 0, 7); ctx.fill();
    }
  }
  const t = tex(c, { repeat: true }); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Вода бассейна: каустика и блики. */
export function waterTexture() {
  const S = 512, c = canvas(S, S), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, S); g.addColorStop(0, '#2fb4cf'); g.addColorStop(1, '#1b9ec0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  blobs(ctx, S, 40, 40, 140, '10,110,150', 0.25);
  ctx.lineCap = 'round';
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 14 + Math.random() * 38;
    ctx.strokeStyle = `rgba(215,250,255,${0.08 + Math.random() * 0.14})`; ctx.lineWidth = 1 + Math.random() * 1.6;
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) { ctx.beginPath(); ctx.ellipse(x + ox, y + oy, r, r * 0.55, Math.random() * 3, 0, Math.PI * (0.6 + Math.random() * 0.9)); ctx.stroke(); }
  }
  const t = tex(c, { repeat: true }); t.anisotropy = 8; return t;
}
