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
