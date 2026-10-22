// Фон и окружение: небо, облака, дальний город, дома, деревья, машины, кусты. Сложные предметы рисуются один раз в спрайты.
import { CONFIG } from '../config.js';
import { createRng } from '../rng.js';
import { TAU, rr, vgrad, hgrad, rgrad, glow, alpha, mix, shade, lerp, clamp, hash, sprite, blit, smooth } from './util.js';

// ---------- спрайты ----------
function win(ctx, x, y, w, h, lit, tone = '#27465e') {
  rr(ctx, x, y, w, h, 2); ctx.fillStyle = vgrad(ctx, y, y + h, lit ? [[0, '#ffe2a0'], [1, '#f2a850']] : [[0, shade(tone, 0.25)], [1, shade(tone, -0.35)]]); ctx.fill();
  if (!lit) { ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + w * 0.55, y + 1); ctx.lineTo(x + 1, y + h * 0.7); ctx.closePath(); ctx.fill(); }
}

const WALLS = ['#e8e0d0', '#d9d2c4', '#efe6d6', '#ddd5c7'];

function drawHouse(ctx, w, h, v) {
  const wall = WALLS[v % WALLS.length], base = 28;
  // тень от крыши на стене и основной объём
  rr(ctx, 0, 40, w, h - 40, 2); ctx.fillStyle = vgrad(ctx, 40, h, [[0, shade(wall, 0.05)], [1, shade(wall, -0.12)]]); ctx.fill();
  // цоколь
  ctx.fillStyle = '#a8a091'; ctx.fillRect(0, h - base, w, base); ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < w; i += 36) ctx.fillRect(i, h - base, 1.5, base);
  // плоская крыша с карнизом
  rr(ctx, -14, 18, w + 28, 26, 4); ctx.fillStyle = vgrad(ctx, 18, 44, [[0, '#4a4e55'], [1, '#2d3036']]); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-12, 19, w + 24, 2);
  // верхний этаж: панорамные окна и деревянные ламели
  const wy = 62, wh = 78;
  win(ctx, 24, wy, 150, wh, v === 1);
  for (let i = 0; i < 5; i++) { ctx.fillStyle = 'rgba(20,24,30,0.55)'; ctx.fillRect(24 + i * 30, wy, 2, wh); }
  ctx.fillStyle = vgrad(ctx, wy, wy + wh, [[0, '#c9945e'], [1, '#9c6c3e']]); ctx.fillRect(w - 170, wy, 120, wh);
  for (let i = 0; i < 24; i++) { ctx.fillStyle = 'rgba(60,35,15,0.35)'; ctx.fillRect(w - 170 + i * 5, wy, 1.4, wh); }
  win(ctx, w - 40, wy + 8, 22, 60, v === 2);
  // нижний этаж: гараж и вход
  const gy = h - base - 112;
  rr(ctx, 30, gy, 190, 112, 3); ctx.fillStyle = vgrad(ctx, gy, gy + 112, [[0, '#4b4f57'], [1, '#2e3137']]); ctx.fill();
  for (let i = 1; i < 6; i++) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(30, gy + i * 18.6, 190, 2); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(30, gy + i * 18.6 + 2, 190, 1); }
  ctx.fillStyle = '#d8d0c0'; ctx.fillRect(24, gy - 8, 202, 8);
  win(ctx, w - 230, gy + 4, 120, 108, v !== 1);
  rr(ctx, w - 96, gy + 8, 48, 104, 3); ctx.fillStyle = vgrad(ctx, gy, gy + 112, [[0, '#8c5f36'], [1, '#6c4526']]); ctx.fill();
  ctx.fillStyle = '#e9dcb8'; ctx.fillRect(w - 58, gy + 56, 3, 14);
  // светильники
  for (const lx of [w - 108, 232]) { ctx.fillStyle = '#2d3036'; ctx.fillRect(lx, gy + 18, 6, 14); glow(ctx, lx + 3, gy + 32, 26, '#ffd28a', 0.7); }
}

function drawBlock(ctx, w, h, v) {
  const wall = ['#d7d2c8', '#cbc7c0', '#e0d6c4'][v % 3];
  rr(ctx, 0, 0, w, h, 3); ctx.fillStyle = hgrad(ctx, 0, w, [[0, shade(wall, 0.06)], [1, shade(wall, -0.12)]]); ctx.fill();
  ctx.fillStyle = '#3a3d44'; ctx.fillRect(-6, 0, w + 12, 14);
  const cols = Math.floor((w - 24) / 44), rows = Math.floor((h - 90) / 52);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = 18 + c * 44, y = 30 + r * 52, lit = hash(v * 13 + r, c * 7 + 3) < 0.34;
    win(ctx, x, y, 28, 36, lit); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x - 3, y + 36, 34, 4);
  }
  ctx.fillStyle = '#3a3d44'; ctx.fillRect(0, h - 56, w, 56); win(ctx, 14, h - 48, w - 28, 40, true);
  ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(w - 30, 14, 30, h - 14);
}

function drawShop(ctx, w, h, v) {
  const wall = ['#e6dac4', '#d9d6cf', '#e8d3c0'][v % 3];
  rr(ctx, 0, 20, w, h - 20, 3); ctx.fillStyle = vgrad(ctx, 20, h, [[0, shade(wall, 0.05)], [1, shade(wall, -0.14)]]); ctx.fill();
  ctx.fillStyle = '#3a3d44'; ctx.fillRect(-8, 10, w + 16, 14);
  // витрина и вывеска
  win(ctx, 24, h - 108, w - 48, 92, true);
  for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(80,50,20,0.22)'; ctx.fillRect(34 + i * ((w - 68) / 6), h - 100, 3, 76); }
  const tone = ['#c9462f', '#2f7a9c', '#4f8a3a'][v % 3];
  for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? '#f6f1e6' : tone; ctx.beginPath(); ctx.moveTo(14 + i * ((w - 28) / 12), h - 126); ctx.lineTo(14 + (i + 1) * ((w - 28) / 12), h - 126); ctx.lineTo(8 + (i + 1) * ((w - 16) / 12), h - 100); ctx.lineTo(2 + i * ((w - 16) / 12), h - 100); ctx.closePath(); ctx.fill(); }
  rr(ctx, w / 2 - 60, 34, 120, 28, 5); ctx.fillStyle = '#2a2d33'; ctx.fill(); ctx.fillStyle = '#f1c96a'; ctx.fillRect(w / 2 - 48, 46, 96, 4);
  glow(ctx, w / 2, 48, 70, '#ffd28a', 0.35);
}

function drawTree(ctx, w, h, v) {
  const rng = createRng(v * 977 + 5), cx = w / 2;
  ctx.fillStyle = vgrad(ctx, h * 0.5, h, [[0, '#7a5a3a'], [1, '#4d3822']]);
  ctx.beginPath(); ctx.moveTo(cx - 9, h); ctx.lineTo(cx - 5, h * 0.52); ctx.lineTo(cx + 5, h * 0.52); ctx.lineTo(cx + 10, h); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#5c4329'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, h * 0.62); ctx.lineTo(cx - w * 0.2, h * 0.42); ctx.moveTo(cx, h * 0.58); ctx.lineTo(cx + w * 0.18, h * 0.38); ctx.stroke();
  const greens = [['#2a5e33', '#3f7d3a'], ['#2f6a35', '#4a8a3c'], ['#3b7438', '#5b9a45']][v % 3];
  const blobs = [];
  for (let i = 0; i < 9; i++) blobs.push({ x: cx + (rng.next() - 0.5) * w * 0.62, y: h * (0.2 + rng.next() * 0.34), r: w * (0.16 + rng.next() * 0.09) });
  blobs.sort((a, b) => b.y - a.y);
  for (const b of blobs) { ctx.fillStyle = rgrad(ctx, b.x + b.r * 0.35, b.y - b.r * 0.4, b.r * 0.1, b.r * 1.1, [[0, '#9cc95a'], [0.35, greens[1]], [1, greens[0]]]); ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); }
  for (const b of blobs) { ctx.strokeStyle = 'rgba(255,214,140,0.45)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 1, -1.0, 0.2); ctx.stroke(); }
}

function drawCypress(ctx, w, h) {
  ctx.fillStyle = '#4d3822'; ctx.fillRect(w / 2 - 3, h - 22, 6, 22);
  ctx.fillStyle = rgrad(ctx, w * 0.62, h * 0.35, 4, h * 0.6, [[0, '#6aa24a'], [0.5, '#3b7438'], [1, '#234d2b']]);
  ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.bezierCurveTo(w * 0.95, h * 0.3, w * 0.95, h * 0.8, w / 2 + 4, h - 20); ctx.lineTo(w / 2 - 4, h - 20); ctx.bezierCurveTo(w * 0.05, h * 0.8, w * 0.05, h * 0.3, w / 2, 0); ctx.fill();
}

function drawBush(ctx, w, h, tone) {
  const rng = createRng(tone * 31 + 9), g = ['#2f6a35', '#3f7d3a', '#4f8f42'];
  for (let i = 0; i < 6; i++) { const x = w * (0.18 + 0.64 * (i / 5)) + (rng.next() - 0.5) * 8, r = h * (0.38 + rng.next() * 0.2), y = h - r * 0.75; ctx.fillStyle = rgrad(ctx, x + r * 0.3, y - r * 0.35, r * 0.1, r * 1.1, [[0, '#8fc257'], [0.4, g[(i + 1) % 3]], [1, g[0]]]); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  const col = ['#f6f1e6', '#f3c7d6', '#c5a8e6', '#fff0b8'][tone % 4];
  for (let i = 0; i < 26; i++) { const x = w * 0.1 + rng.next() * w * 0.8, y = h * (0.15 + rng.next() * 0.6); ctx.fillStyle = rng.next() < 0.7 ? col : '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 2.4 + rng.next() * 1.8, 0, TAU); ctx.fill(); }
}

function drawHedge(ctx, w, h) {
  rr(ctx, 0, 0, w, h, 14); ctx.fillStyle = vgrad(ctx, 0, h, [[0, '#4f8f42'], [1, '#2a5a2f']]); ctx.fill();
  const rng = createRng(w * 7 + 1);
  for (let i = 0; i < w / 3; i++) { ctx.fillStyle = `rgba(${rng.next() < 0.5 ? '160,210,90' : '20,60,30'},${0.12 + rng.next() * 0.16})`; ctx.beginPath(); ctx.arc(rng.next() * w, rng.next() * h, 3 + rng.next() * 6, 0, TAU); ctx.fill(); }
}

function drawCar(ctx, w, h, color) {
  // боковой вид седана/кроссовера: тело с градиентом, окна, колёса с дисками, фары
  const body = color, hi = shade(color, 0.28), lo = shade(color, -0.35);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(w / 2, h - 3, w * 0.46, 5, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(6, h - 18); ctx.quadraticCurveTo(4, h - 34, 20, h - 38); ctx.lineTo(w * 0.28, h - 40); ctx.quadraticCurveTo(w * 0.36, h - 74, w * 0.5, h - 76); ctx.lineTo(w * 0.7, h - 74); ctx.quadraticCurveTo(w * 0.82, h - 70, w * 0.88, h - 42); ctx.lineTo(w - 12, h - 38); ctx.quadraticCurveTo(w - 4, h - 34, w - 6, h - 18); ctx.lineTo(w - 6, h - 12); ctx.lineTo(6, h - 12); ctx.closePath();
  ctx.fillStyle = vgrad(ctx, h - 76, h - 10, [[0, hi], [0.45, body], [1, lo]]); ctx.fill();
  // окна
  ctx.beginPath(); ctx.moveTo(w * 0.3, h - 42); ctx.quadraticCurveTo(w * 0.37, h - 70, w * 0.5, h - 71); ctx.lineTo(w * 0.69, h - 69); ctx.quadraticCurveTo(w * 0.78, h - 66, w * 0.83, h - 43); ctx.closePath();
  ctx.fillStyle = vgrad(ctx, h - 72, h - 42, [[0, '#3a4a5e'], [1, '#141b26']]); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.moveTo(w * 0.32, h - 44); ctx.lineTo(w * 0.4, h - 66); ctx.lineTo(w * 0.47, h - 66); ctx.lineTo(w * 0.38, h - 44); ctx.closePath(); ctx.fill();
  ctx.fillStyle = body; ctx.fillRect(w * 0.545, h - 72, 4, 30);
  // линия кузова и блики
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(14, h - 34); ctx.lineTo(w - 16, h - 34); ctx.stroke();
  ctx.fillStyle = '#fff2c4'; rr(ctx, w - 18, h - 32, 11, 7, 3); ctx.fill(); glow(ctx, w - 12, h - 28, 22, '#fff0b0', 0.6);
  ctx.fillStyle = '#e03a2a'; rr(ctx, 5, h - 32, 9, 7, 3); ctx.fill();
  ctx.fillStyle = '#1c1d21'; ctx.fillRect(6, h - 14, w - 12, 5);
  for (const cx of [w * 0.24, w * 0.76]) {
    ctx.fillStyle = '#17181c'; ctx.beginPath(); ctx.arc(cx, h - 14, 16, 0, TAU); ctx.fill();
    ctx.fillStyle = rgrad(ctx, cx - 3, h - 17, 1, 11, [[0, '#e8ebef'], [1, '#7c8088']]); ctx.beginPath(); ctx.arc(cx, h - 14, 9.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2d3036'; ctx.beginPath(); ctx.arc(cx, h - 14, 3, 0, TAU); ctx.fill();
  }
}

function drawLamp(ctx, w, h) {
  ctx.fillStyle = vgrad(ctx, 0, h, [[0, '#3a3e46'], [1, '#22252b']]);
  ctx.fillRect(w / 2 - 3, 20, 6, h - 20); rr(ctx, w / 2 - 9, h - 14, 18, 14, 4); ctx.fill();
  ctx.beginPath(); ctx.moveTo(w / 2, 22); ctx.quadraticCurveTo(w / 2, 4, w / 2 - 26, 6); ctx.lineWidth = 5; ctx.strokeStyle = '#33373e'; ctx.stroke();
  rr(ctx, w / 2 - 38, 2, 24, 9, 4); ctx.fillStyle = '#2a2d33'; ctx.fill();
  glow(ctx, w / 2 - 26, 12, 46, '#ffd28a', 0.8); ctx.fillStyle = '#fff3cf'; rr(ctx, w / 2 - 34, 9, 16, 4, 2); ctx.fill();
}

function drawBollard(ctx, w, h) {
  rr(ctx, w / 2 - 7, 8, 14, h - 8, 5); ctx.fillStyle = vgrad(ctx, 0, h, [[0, '#4a4e56'], [1, '#26292f']]); ctx.fill();
  glow(ctx, w / 2, 16, 28, '#ffd28a', 0.8); ctx.fillStyle = '#fff0c4'; rr(ctx, w / 2 - 5, 11, 10, 8, 3); ctx.fill();
}

function drawPlanterBg(ctx, w, h) {
  rr(ctx, 0, h * 0.4, w, h * 0.6, 4); ctx.fillStyle = vgrad(ctx, h * 0.4, h, [[0, '#d7d1c4'], [1, '#a59e8f']]); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(2, h * 0.4 + 1, w - 4, 3);
  const rng = createRng(w + 77);
  for (let i = 0; i < 5; i++) { const x = w * (0.12 + i * 0.19), r = 15 + rng.next() * 8; ctx.fillStyle = rgrad(ctx, x + 4, h * 0.38, 2, r * 1.2, [[0, '#8fc257'], [1, '#2f6a35']]); ctx.beginPath(); ctx.arc(x, h * 0.34, r, 0, TAU); ctx.fill(); }
  for (let i = 0; i < 12; i++) { ctx.fillStyle = rng.next() < 0.6 ? '#f6f1e6' : '#f0b8cc'; ctx.beginPath(); ctx.arc(rng.next() * w, h * (0.15 + rng.next() * 0.3), 2.6, 0, TAU); ctx.fill(); }
}

function drawCloud(ctx, w, h) {
  const rng = createRng(w * 3 + 1);
  for (let i = 0; i < 9; i++) { const x = w * (0.1 + 0.8 * rng.next()), y = h * (0.4 + 0.3 * rng.next()), r = h * (0.22 + 0.2 * rng.next()); ctx.fillStyle = rgrad(ctx, x, y, 0, r, [[0, 'rgba(255,248,235,0.85)'], [0.6, 'rgba(255,238,215,0.5)'], [1, 'rgba(255,232,205,0)']]); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
}

/** Платформы (уступы): ровная верхняя кромка по всей ширине. Верх = y=0 спрайта. */
export function drawLedge(ctx, kind, w, h) {
  const top = (c1, c2) => { rr(ctx, 0, 0, w, 10, [4, 4, 0, 0]); ctx.fillStyle = vgrad(ctx, 0, 10, [[0, c1], [1, c2]]); ctx.fill(); };
  if (kind === 'crate') {
    // поддон с коробками X2
    const bw = 44, bh = h - 14;
    for (let x = 0; x < w - 2; x += bw) {
      const cw = Math.min(bw, w - x);
      rr(ctx, x + 1, 0, cw - 2, bh, 3); ctx.fillStyle = vgrad(ctx, 0, bh, [[0, '#e2ae6c'], [0.5, '#cf9650'], [1, '#a8703a']]); ctx.fill(); ctx.strokeStyle = 'rgba(90,55,20,0.6)'; ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,200,0.3)'; ctx.fillRect(x + 3, 2, cw - 6, 3);
      ctx.save(); ctx.translate(x + cw / 2, bh / 2 + 1); ctx.strokeStyle = '#171717'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(9, 0); ctx.lineTo(0, 9); ctx.lineTo(-9, 0); ctx.closePath(); ctx.stroke(); ctx.fillStyle = '#171717'; ctx.font = '900 8px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('X2', 0, 0.5); ctx.restore();
    }
    rr(ctx, 0, bh, w, 14, 2); ctx.fillStyle = '#9a6f3f'; ctx.fill(); ctx.fillStyle = '#6b4a28'; for (let x = 8; x < w - 10; x += 36) ctx.fillRect(x, bh + 2, 14, 10);
  } else if (kind === 'barrier') {
    rr(ctx, 0, 0, w, h, 6); ctx.fillStyle = vgrad(ctx, 0, h, [[0, '#e6e2da'], [1, '#aaa59a']]); ctx.fill();
    ctx.save(); rr(ctx, 0, 0, w, h, 6); ctx.clip(); ctx.fillStyle = '#d63b2c'; for (let x = -h; x < w; x += 44) { ctx.beginPath(); ctx.moveTo(x, h * 0.28); ctx.lineTo(x + 22, h * 0.28); ctx.lineTo(x + 22 - 22, h * 0.62); ctx.lineTo(x - 22, h * 0.62); ctx.closePath(); ctx.fill(); } ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(4, 1, w - 8, 3);
  } else if (kind === 'planter') {
    rr(ctx, 0, 0, w, h, 5); ctx.fillStyle = vgrad(ctx, 0, h, [[0, '#dcd6c8'], [1, '#a09a8b']]); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let x = 40; x < w - 10; x += 52) ctx.fillRect(x, 8, 2, h - 8);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(3, 1, w - 6, 3);
  } else if (kind === 'bench') {
    top('#c99a62', '#9c6f3e');
    ctx.fillStyle = vgrad(ctx, 10, h, [[0, '#b58650'], [1, '#85592f']]); ctx.fillRect(6, 10, w - 12, 12);
    for (let x = 0; x < w - 8; x += 26) { ctx.fillStyle = 'rgba(40,20,5,0.3)'; ctx.fillRect(10 + x, 0, 1.4, 22); }
    ctx.fillStyle = '#2a2d33'; for (const lx of [14, w - 22]) { ctx.fillRect(lx, 22, 8, h - 22); ctx.fillRect(lx - 6, h - 6, 20, 6); }
  } else if (kind === 'lounger') {
    rr(ctx, 0, 0, w, 14, 6); ctx.fillStyle = vgrad(ctx, 0, 14, [[0, '#b6bac2'], [1, '#868a94']]); ctx.fill();
    ctx.fillStyle = '#f2efe8'; rr(ctx, 14, -3, 40, 6, 3); ctx.fill();
    ctx.fillStyle = vgrad(ctx, 14, h, [[0, '#a07848'], [1, '#6e4f2c']]); ctx.fillRect(6, 14, w - 12, 8);
    ctx.fillStyle = '#7a5a34'; for (const lx of [10, w - 18]) ctx.fillRect(lx, 22, 8, h - 22);
  } else { // step / подиум из камня
    rr(ctx, 0, 0, w, h, 5); ctx.fillStyle = vgrad(ctx, 0, h, [[0, '#e3dccd'], [1, '#aaa291']]); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(3, 1, w - 6, 4); ctx.fillStyle = 'rgba(0,0,0,0.14)'; for (let y = 30; y < h; y += 30) ctx.fillRect(0, y, w, 2);
  }
}

// ---------- сборка ----------
export class Scenery {
  constructor(scale, level) {
    this.scale = scale; this.level = level;
    const S = scale, sp = (w, h, fn) => sprite(w, h, S, (c, ww, hh) => fn(c, ww, hh));
    this.sp = {
      house: [0, 1, 2].map(v => sp(560, 330, (c, w, h) => drawHouse(c, w, h, v))),
      block: [0, 1, 2].map(v => sp(300, 440, (c, w, h) => drawBlock(c, w, h, v))),
      shop: [0, 1, 2].map(v => sp(380, 200, (c, w, h) => drawShop(c, w, h, v))),
      tree: [0, 1, 2, 3, 4, 5].map(v => sp(230, 310, (c, w, h) => drawTree(c, w, h, v))),
      cypress: [sp(70, 280, (c, w, h) => drawCypress(c, w, h))],
      bush: [0, 1, 2, 3].map(v => sp(150, 80, (c, w, h) => drawBush(c, w, h, v))),
      hedge: [sp(300, 54, (c, w, h) => drawHedge(c, w, h))],
      car: ['#2c3a52', '#b9bec4', '#8c1f2a', '#e4e6e8', '#41505c', '#1f2a24', '#c9a24a'].map(col => sp(240, 90, (c, w, h) => drawCar(c, w, h, col))),
      lamp: [sp(60, 240, (c, w, h) => drawLamp(c, w, h))],
      bollard: [sp(24, 46, (c, w, h) => drawBollard(c, w, h))],
      planter: [sp(170, 74, (c, w, h) => drawPlanterBg(c, w, h))],
      cloud: [sp(420, 150, (c, w, h) => drawCloud(c, w, h)), sp(300, 110, (c, w, h) => drawCloud(c, w, h))],
    };
    this.ledgeSprites = new Map();
    this.build();
  }

  ledgeSprite(l) {
    const key = `${l.kind}:${Math.round(l.x1 - l.x0)}:${l.h}`;
    let s = this.ledgeSprites.get(key);
    if (!s) { const w = Math.round(l.x1 - l.x0), h = Math.min(l.h + 10, 150); s = sprite(w, h, this.scale, (c) => drawLedge(c, l.kind, w, h)); this.ledgeSprites.set(key, s); }
    return s;
  }

  build() {
    const rng = createRng(CONFIG.seed + CONFIG.seedOffsets.scenery), L = CONFIG.zoneLen, n = CONFIG.zones.length, total = n * L;
    const far = [], mid = [], near = [], back = [], clouds = [];
    // x задаётся в «координатах слоя»: слой сдвигается со скоростью p от камеры, поэтому зону считаем по x / p
    const gen = (p, step, fn) => { for (let x = -300; x < total * p + 2400; x += (typeof step === 'function' ? step() : step)) fn(x, clamp(Math.floor(x / p / L), 0, n - 1)); };
    gen(0.1, () => rng.range(90, 190), (x, z) => far.push({ x, w: rng.range(70, 150), h: rng.range(70, z === 0 ? 260 : 190), z, tree: rng.next() < (z === 1 || z === 3 ? 0.55 : 0.25) }));
    // средний план: здания разной «профессии» по зонам
    for (let x = -300; x < total * 0.3 + 2400;) {
      const z = clamp(Math.floor(x / 0.3 / L), 0, n - 1);
      let kind;
      if (z === 0) kind = rng.next() < 0.6 ? 'block' : 'shop';
      else if (z === 1) kind = rng.next() < 0.75 ? 'house' : 'block';
      else if (z === 2) kind = rng.next() < 0.6 ? 'shop' : 'block';
      else kind = rng.next() < 0.7 ? 'house' : 'cypress';
      const v = rng.int(0, 2), arr = this.sp[kind], s = arr[v % arr.length];
      mid.push({ kind, s, x, v });
      x += s.w * 0.92 + rng.range(30, 160);
    }
    gen(0.62, () => rng.range(240, 480), (x, z) => near.push({ s: rng.pick(this.sp.tree), x, scale: rng.range(0.85, 1.25), kind: 'tree' }));
    gen(0.62, () => rng.range(340, 560), (x, z) => { if (z === 0) near.push({ s: rng.pick(this.sp.car), x: x + 90, scale: 1.0, kind: 'car' }); });
    gen(0.62, () => rng.range(520, 720), (x, z) => near.push({ s: this.sp.lamp[0], x, scale: 1, kind: 'lamp' }));
    gen(1, () => rng.range(120, 300), (x, z) => {
      const r = rng.next();
      if (r < 0.5) back.push({ s: rng.pick(this.sp.bush), x, scale: rng.range(0.9, 1.3), kind: 'bush' });
      else if (r < 0.7) back.push({ s: this.sp.hedge[0], x, scale: 1, kind: 'hedge' });
      else if (z === 2 || z === 0) back.push({ s: this.sp.planter[0], x, scale: 1, kind: 'planter' });
      else back.push({ s: rng.pick(this.sp.bush), x, scale: rng.range(0.9, 1.2), kind: 'bush' });
      if (rng.next() < 0.4) back.push({ s: this.sp.bollard[0], x: x + rng.range(20, 90), scale: 1, kind: 'bollard' });
    });
    for (let x = -400; x < 12000; x += rng.range(380, 760)) clouds.push({ x, y: rng.range(40, 250), s: rng.pick(this.sp.cloud), sp: rng.range(0.03, 0.07), k: rng.range(0.7, 1.3) });
    this.layers = { far, mid, near, back, clouds };
  }

  // ----- вспомогательное -----
  zoneColors(camX, key) {
    const L = CONFIG.zoneLen, zs = CONFIG.zones, f = clamp(camX / L, 0, zs.length - 1e-3), i = Math.floor(f);
    const t = smooth(clamp((f - i - 0.82) / 0.18, 0, 1));
    const a = zs[i][key], b = zs[Math.min(zs.length - 1, i + 1)][key];
    return t > 0 ? mix(a, b, t) : a;
  }

  drawSky(ctx, W, H, GY, camX, t) {
    const top = this.zoneColors(camX, 'skyTop'), bot = this.zoneColors(camX, 'skyBottom'), sun = this.zoneColors(camX, 'sun');
    ctx.fillStyle = vgrad(ctx, 0, GY - 20, [[0, top], [0.75, bot], [1, mix(bot, '#ffffff', 0.25)]]); ctx.fillRect(0, 0, W, H);
    // солнце
    const sx = W * 0.74, sy = GY - 270;
    glow(ctx, sx, sy, 520, sun, 0.7); glow(ctx, sx, sy, 190, '#fff3d0', 0.85);
    ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(sx, sy, 34, 0, TAU); ctx.fill();
    // лучи
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const a = 2.0 + i * 0.22 + Math.sin(t * 0.15 + i) * 0.03, len = 900;
      const g = ctx.createLinearGradient(sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len); g.addColorStop(0, 'rgba(255,225,160,0.2)'); g.addColorStop(1, 'rgba(255,225,160,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a - 0.05) * len, sy + Math.sin(a - 0.05) * len); ctx.lineTo(sx + Math.cos(a + 0.05) * len, sy + Math.sin(a + 0.05) * len); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // облака
    for (const c of this.layers.clouds) {
      const per = 12400, px = (((c.x - camX * c.sp + t * c.sp * 90) % per) + per) % per - 500;
      if (px > W + 20 || px + c.s.w * c.k < -20) continue;
      ctx.drawImage(c.s.canvas, px, c.y + (GY - 520) * 0.2, c.s.w * c.k, c.s.h * c.k);
    }
  }

  drawFar(ctx, W, GY, camX) {
    const p = 0.1, hill = this.zoneColors(camX, 'hill'), fog = this.zoneColors(camX, 'fog');
    const col = mix(hill, fog, 0.4), dark = mix(hill, '#4a5a70', 0.2);
    // холмы
    ctx.fillStyle = mix(col, fog, 0.3); ctx.beginPath(); ctx.moveTo(0, GY - 70);
    for (let x = 0; x <= W + 40; x += 40) ctx.lineTo(x, GY - 150 - Math.sin((x + camX * 0.06) * 0.004) * 38 - Math.sin((x + camX * 0.06) * 0.011) * 14);
    ctx.lineTo(W, GY - 70); ctx.closePath(); ctx.fill();
    for (const b of this.layers.far) {
      const sx = b.x - camX * p; if (sx > W + 20 || sx + b.w < -20) continue;
      if (b.tree) { ctx.fillStyle = mix(col, '#3b6a3a', 0.35); ctx.beginPath(); ctx.arc(sx + b.w / 2, GY - 150 - b.h * 0.38, b.h * 0.34 + 10, 0, TAU); ctx.fill(); continue; }
      ctx.fillStyle = vgrad(ctx, GY - 160 - b.h, GY - 130, [[0, mix(col, '#ffffff', 0.12)], [1, dark]]); ctx.fillRect(sx, GY - 150 - b.h, b.w, b.h + 30);
      ctx.fillStyle = 'rgba(255,225,160,0.35)'; for (let wy = GY - 140 - b.h + 10; wy < GY - 140; wy += 22) for (let wx = sx + 8; wx < sx + b.w - 10; wx += 18) if (hash(wx * 0.05 | 0, wy | 0) < 0.3) ctx.fillRect(wx, wy, 7, 9);
    }
    ctx.fillStyle = alpha(fog, 0.5); ctx.fillRect(0, GY - 170, W, 110);
  }

  drawMid(ctx, W, GY, camX) {
    const p = 0.3, fog = this.zoneColors(camX, 'fog');
    for (const m of this.layers.mid) {
      const sx = m.x - camX * p; if (sx > W + 20 || sx + m.s.w < -20) continue;
      const by = m.kind === 'cypress' ? GY - 52 : GY - 56;
      ctx.drawImage(m.s.canvas, sx, by - m.s.h + 8, m.s.w, m.s.h);
    }
    ctx.fillStyle = vgrad(ctx, GY - 330, GY, [[0, alpha(fog, 0)], [0.55, alpha(fog, 0.22)], [1, alpha(fog, 0.42)]]); ctx.fillRect(0, GY - 330, W, 330);
  }

  drawNear(ctx, W, GY, camX) {
    const p = 0.62;
    for (const n of this.layers.near) {
      const sx = n.x - camX * p, w = n.s.w * n.scale, h = n.s.h * n.scale; if (sx > W + 20 || sx + w < -20) continue;
      const base = n.kind === 'car' ? GY - 66 : GY - 62;
      ctx.drawImage(n.s.canvas, sx, base - h + 6, w, h);
    }
  }

  /** Ряд кустов, изгородей и клумб сразу за дорожкой (скорость как у земли). */
  drawBack(ctx, W, GY, camX) {
    for (const n of this.layers.back) {
      const sx = n.x - camX, w = n.s.w * n.scale, h = n.s.h * n.scale; if (sx > W + 20 || sx + w < -20) continue;
      ctx.drawImage(n.s.canvas, sx, GY - 62 - h + 8, w, h);
    }
  }
}
