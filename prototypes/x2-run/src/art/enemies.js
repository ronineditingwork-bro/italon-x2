// Враги («брак»), дрон-носитель, предметы, пули и боссы. Всё рисуется кодом. Начало координат — ступни/центр на земле.
import { TAU, rr, vgrad, hgrad, rgrad, glow, alpha, clamp, lerp, shade, mix } from './util.js';

const STEEL = ['#9da1a9', '#6c7079', '#4a4d55'];

// ---------- бегун: треснувшая плитка на ножках ----------
export function drawRunner(ctx, e, t) {
  const dir = e.dir || -1, ph = t * 11 + e.id;
  ctx.save(); ctx.scale(-dir, 1);                        // рисуем лицом вправо (dir=-1 → отражаем)
  const hop = Math.abs(Math.sin(ph)) * 3;
  // ножки
  for (const s of [-1, 1]) {
    const a = Math.sin(ph + (s > 0 ? 0 : Math.PI)) * 0.7;
    ctx.save(); ctx.translate(s * 9, -17 - hop); ctx.rotate(a * 0.6);
    rr(ctx, -4, 0, 8, 15, 3); ctx.fillStyle = '#3a3d44'; ctx.fill();
    rr(ctx, -6, 12, 14, 6, 3); ctx.fillStyle = '#25272c'; ctx.fill();
    ctx.restore();
  }
  ctx.translate(0, -hop);
  ctx.rotate(Math.sin(ph) * 0.05);
  // корпус-плитка со сколом
  ctx.beginPath(); ctx.moveTo(-19, -54); ctx.lineTo(10, -54); ctx.lineTo(19, -46); ctx.lineTo(19, -17); ctx.quadraticCurveTo(19, -14, 16, -14); ctx.lineTo(-16, -14); ctx.quadraticCurveTo(-19, -14, -19, -17); ctx.closePath();
  ctx.fillStyle = vgrad(ctx, -54, -14, [[0, STEEL[0]], [0.55, STEEL[1]], [1, STEEL[2]]]); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-17, -17); ctx.lineTo(-17, -52); ctx.lineTo(9, -52); ctx.stroke();
  ctx.fillStyle = 'rgba(20,22,28,0.25)'; rr(ctx, -13, -48, 26, 28, 3); ctx.fill();      // «врезка» плитки
  // трещина с тлеющей щелью
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const crack = () => { ctx.beginPath(); ctx.moveTo(-3, -54); ctx.lineTo(2, -44); ctx.lineTo(-4, -37); ctx.lineTo(4, -29); ctx.lineTo(-1, -22); ctx.lineTo(3, -14); };
  ctx.strokeStyle = '#121317'; ctx.lineWidth = 4; crack(); ctx.stroke();
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,120,40,0.85)'; ctx.lineWidth = 1.6; crack(); ctx.stroke(); ctx.restore();
  // злые глаза
  ctx.fillStyle = '#ffef9a'; ctx.beginPath(); ctx.ellipse(8, -38, 3.6, 4.4, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(-9, -38, 3.2, 4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#d9230f'; ctx.beginPath(); ctx.arc(9, -37.5, 2, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(-8, -37.5, 1.8, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#17181b'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(3, -44); ctx.lineTo(13, -41); ctx.moveTo(-14, -41); ctx.lineTo(-4, -44); ctx.stroke();
  ctx.restore();
}

// ---------- дрон-осколок ----------
export function drawFlyer(ctx, e, t) {
  const warn = e.shootIn !== undefined && e.shootIn < 0.5;
  ctx.save(); ctx.rotate(Math.sin(t * 2 + e.id) * 0.08);
  glow(ctx, 0, 14, 30, '#ff7a30', 0.45);
  // роторы
  for (const s of [-1, 1]) {
    ctx.save(); ctx.translate(s * 26, -14);
    ctx.fillStyle = '#2a2d33'; rr(ctx, -2, 0, 4, 12, 2); ctx.fill();
    ctx.fillStyle = 'rgba(210,215,225,0.38)'; ctx.beginPath(); ctx.ellipse(0, 0, 17, 3.2 + Math.abs(Math.sin(t * 40 + s)) * 1.2, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // осколок
  ctx.beginPath(); ctx.moveTo(-24, -4); ctx.lineTo(-9, -17); ctx.lineTo(14, -15); ctx.lineTo(26, 0); ctx.lineTo(10, 15); ctx.lineTo(-12, 13); ctx.closePath();
  ctx.fillStyle = vgrad(ctx, -17, 15, [[0, '#a8acb4'], [0.5, '#70747d'], [1, '#43464d']]); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-22, -4); ctx.lineTo(-9, -15); ctx.lineTo(13, -13); ctx.stroke();
  ctx.strokeStyle = '#17181b'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-2, -16); ctx.lineTo(3, -5); ctx.lineTo(-3, 3); ctx.lineTo(2, 13); ctx.stroke();
  // глаз
  glow(ctx, 6, -1, warn ? 34 : 20, '#ff4a2a', warn ? 1 : 0.7);
  ctx.fillStyle = warn ? '#fff0b0' : '#ff7a4a'; ctx.beginPath(); ctx.arc(6, -1, warn ? 5 : 4, 0, TAU); ctx.fill();
  ctx.fillStyle = '#7a0f08'; ctx.beginPath(); ctx.arc(6, -1, 2, 0, TAU); ctx.fill();
  ctx.restore();
}

// ---------- люк-турель ----------
export function drawTurret(ctx, e, t) {
  const k = e.k ?? (e.state === 'open' ? 1 : 0);
  // основание-люк
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, 1, 36, 8, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = vgrad(ctx, -8, 8, [[0, '#585c64'], [1, '#2f3237']]); ctx.beginPath(); ctx.ellipse(0, -2, 33, 9, 0, 0, TAU); ctx.fill();
  // шток
  const rise = 6 + k * 34;
  ctx.fillStyle = vgrad(ctx, -rise - 4, 0, [[0, '#7a7e86'], [1, '#41444b']]); rr(ctx, -15, -rise, 30, rise - 2, 4); ctx.fill();
  // створки люка
  ctx.save(); ctx.translate(0, -2);
  for (const s of [-1, 1]) { ctx.save(); ctx.translate(s * 30, 0); ctx.rotate(s * k * 0.55); ctx.fillStyle = vgrad(ctx, -6, 4, [[0, '#8a8e96'], [1, '#4b4e55']]); ctx.beginPath(); ctx.ellipse(-s * 14, -1, 16, 5, 0, 0, TAU); ctx.fill(); ctx.restore(); }
  ctx.restore();
  // предупреждающие шевроны на закрытом люке
  if (k < 0.5) { ctx.save(); ctx.globalAlpha = 1 - k * 2; ctx.fillStyle = '#f2a523'; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 11 - 4, -5); ctx.lineTo(i * 11 + 2, -5); ctx.lineTo(i * 11 + 6, -1); ctx.lineTo(i * 11 + 0, -1); ctx.closePath(); ctx.fill(); } ctx.restore(); }
  // голова и ствол
  if (k > 0.2) {
    ctx.save(); ctx.translate(0, -rise - 4); ctx.globalAlpha = clamp((k - 0.2) / 0.6, 0, 1);
    ctx.fillStyle = vgrad(ctx, -14, 12, [[0, '#9a9ea6'], [1, '#4a4d54']]); ctx.beginPath(); ctx.arc(0, 0, 17, Math.PI, 0); ctx.lineTo(17, 8); ctx.lineTo(-17, 8); ctx.closePath(); ctx.fill();
    ctx.save(); let a = e.ang ?? Math.PI; ctx.rotate(a);
    rr(ctx, 4, -5, 30, 10, 3); ctx.fillStyle = '#2a2d33'; ctx.fill(); ctx.fillStyle = '#f2a523'; ctx.fillRect(24, -5.4, 4, 10.8);
    ctx.restore();
    const hot = e.state === 'open' && e.burstLeft > 0;
    glow(ctx, 0, 0, hot ? 30 : 18, '#ff4a2a', hot ? 1 : 0.7);
    ctx.fillStyle = hot ? '#fff0b0' : '#ff5a38'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// ---------- тяжёлый «каток» ----------
export function drawHeavy(ctx, e, t) {
  const dir = e.dir || -1, charging = e.state === 'charge', wind = e.state === 'windup';
  ctx.save(); ctx.scale(-dir, 1);
  const shake = wind ? Math.sin(t * 60) * 1.6 : charging ? Math.sin(t * 40) * 0.8 : 0;
  ctx.translate(shake, 0);
  const spin = (e.x * 0.05);
  // тело
  rr(ctx, -42, -56, 66, 34, 6); ctx.fillStyle = vgrad(ctx, -56, -22, [[0, '#ffbf45'], [0.5, '#f29a1c'], [1, '#c4730f']]); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; for (let i = 0; i < 5; i++) { ctx.save(); ctx.beginPath(); ctx.rect(-40 + i * 12, -30, 6, 6); ctx.restore(); }
  ctx.fillStyle = '#1b1d22'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-40 + i * 11, -28); ctx.lineTo(-34 + i * 11, -28); ctx.lineTo(-30 + i * 11, -24); ctx.lineTo(-36 + i * 11, -24); ctx.closePath(); ctx.fill(); }
  // кабина
  rr(ctx, -30, -78, 34, 24, [8, 8, 2, 2]); ctx.fillStyle = vgrad(ctx, -78, -54, [[0, '#ffc95a'], [1, '#e48a14']]); ctx.fill();
  rr(ctx, -25, -74, 22, 15, 5); ctx.fillStyle = '#10151e'; ctx.fill();
  ctx.fillStyle = 'rgba(180,210,255,0.22)'; ctx.beginPath(); ctx.moveTo(-23, -73); ctx.lineTo(-13, -73); ctx.lineTo(-19, -60); ctx.lineTo(-23, -60); ctx.closePath(); ctx.fill();
  // сигнал
  const flash = (wind || charging) && Math.sin(t * 22) > 0;
  glow(ctx, -13, -82, flash ? 30 : 12, flash ? '#ff3a2a' : '#ffb347', flash ? 1 : 0.5);
  ctx.fillStyle = flash ? '#ff5a46' : '#ffcc6a'; rr(ctx, -17, -85, 8, 5, 2); ctx.fill();
  // выхлоп
  rr(ctx, -40, -88, 5, 22, 2); ctx.fillStyle = '#35383e'; ctx.fill();
  if (charging) { for (let i = 0; i < 3; i++) { ctx.fillStyle = `rgba(230,230,230,${0.32 - i * 0.09})`; ctx.beginPath(); ctx.arc(-38 - i * 9, -92 - i * 7 - (t * 30 % 7), 5 + i * 3, 0, TAU); ctx.fill(); } }
  // барабан спереди
  ctx.save(); ctx.translate(36, -24);
  ctx.fillStyle = rgrad(ctx, -4, -6, 2, 26, [[0, '#d5d8de'], [0.5, '#8b9098'], [1, '#4a4e56']]); ctx.beginPath(); ctx.arc(0, 0, 25, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 25, 0, TAU); ctx.stroke();
  ctx.rotate(spin); ctx.fillStyle = '#3d4047'; for (let i = 0; i < 6; i++) { ctx.rotate(TAU / 6); ctx.beginPath(); ctx.arc(14, 0, 2.4, 0, TAU); ctx.fill(); }
  ctx.restore();
  // заднее колесо
  ctx.save(); ctx.translate(-26, -16); ctx.fillStyle = '#23252a'; ctx.beginPath(); ctx.arc(0, 0, 17, 0, TAU); ctx.fill(); ctx.rotate(spin * 1.6); ctx.fillStyle = '#7b7f87'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill(); ctx.fillStyle = '#31343a'; ctx.fillRect(-1.5, -8, 3, 16); ctx.restore();
  // злые фары
  const fc = charging ? '#fff0b0' : '#ffd36a';
  glow(ctx, 14, -44, charging ? 38 : 16, '#ff4a2a', charging ? 0.9 : 0.35);
  ctx.fillStyle = fc; ctx.beginPath(); ctx.arc(14, -44, 5, 0, TAU); ctx.fill(); ctx.fillStyle = '#b3220f'; ctx.beginPath(); ctx.arc(15, -44, 2.4, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#1a1b1e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(7, -53); ctx.lineTo(21, -48); ctx.stroke();
  ctx.restore();
}

// ---------- дрон-доставщик ----------
export function drawDrone(ctx, e, t) {
  ctx.save(); ctx.rotate(Math.sin(t * 2.4 + e.id) * 0.06);
  // коробка на тросах
  const sw = Math.sin(t * 3 + e.id) * 2;
  ctx.strokeStyle = '#3a3d44'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-9, 2); ctx.lineTo(-11 + sw, 14); ctx.moveTo(9, 2); ctx.lineTo(11 + sw, 14); ctx.stroke();
  ctx.save(); ctx.translate(sw, 0); drawBox(ctx, 0, 27, 27, 0.9, e.item, t); ctx.restore();
  // корпус
  rr(ctx, -16, -9, 32, 13, 6); ctx.fillStyle = vgrad(ctx, -9, 4, [[0, '#fbf6ec'], [1, '#c8bfae']]); ctx.fill();
  ctx.fillStyle = '#252a33'; rr(ctx, -6, -6, 12, 6, 3); ctx.fill(); glow(ctx, 0, -3, 12, '#6fe9ff', 0.6);
  ctx.fillStyle = '#6fe9ff'; ctx.beginPath(); ctx.arc(0, -3, 1.8, 0, TAU); ctx.fill();
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#4a4e56'; rr(ctx, s * 18 - 2.5, -14, 5, 10, 2); ctx.fill();
    ctx.fillStyle = 'rgba(242,138,38,0.55)'; ctx.beginPath(); ctx.ellipse(s * 21, -16, 18, 3 + Math.abs(Math.sin(t * 45 + s)) * 1.3, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

const ITEM = {
  fan:    { color: '#ffb347', letter: 'В', name: 'ВЕЕР' },
  rapid:  { color: '#6fe9ff', letter: 'С', name: 'СКОРОСТРЕЛ' },
  heavy:  { color: '#ff6b6b', letter: 'Т', name: 'ТЯЖЁЛАЯ ПЛИТА' },
  shield: { color: '#7bf29a', letter: 'Щ', name: 'ЩИТ' },
  heart:  { color: '#ff5d7a', letter: '♥', name: '+1 СЕРДЦЕ' },
};
export const ITEMS = ITEM;

/** Коробка X2 с цветным значком предмета. */
export function drawBox(ctx, cx, cy, size, a, kind, t) {
  const it = ITEM[kind] || ITEM.fan, w = size, h = size * 0.92;
  ctx.save(); ctx.translate(cx, cy); ctx.globalAlpha *= a;
  rr(ctx, -w / 2, -h, w, h, 3); ctx.fillStyle = vgrad(ctx, -h, 0, [[0, '#e2ae6c'], [0.5, '#cf9650'], [1, '#a8703a']]); ctx.fill();
  ctx.strokeStyle = 'rgba(90,55,20,0.6)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = 'rgba(255,240,200,0.3)'; ctx.fillRect(-w / 2 + 1, -h + 1, w - 2, 2.5);
  ctx.fillStyle = 'rgba(70,40,15,0.25)'; ctx.fillRect(-w / 2 + 2, -h * 0.55, w - 4, 1.6);
  // значок
  ctx.save(); ctx.translate(0, -h * 0.45);
  ctx.fillStyle = '#17181a'; ctx.beginPath(); ctx.arc(0, 0, size * 0.3, 0, TAU); ctx.fill();
  ctx.fillStyle = it.color; ctx.beginPath(); ctx.arc(0, 0, size * 0.25, 0, TAU); ctx.fill();
  ctx.fillStyle = '#161a20'; ctx.font = `900 ${Math.round(size * 0.33)}px "Arial Black", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(it.letter, 0, size * 0.015);
  ctx.restore();
  ctx.restore();
}

/** Предмет на земле: парящая коробка со свечением. */
export function drawItem(ctx, it, t) {
  const c = (ITEM[it.kind] || ITEM.fan).color, bob = Math.sin(t * 4 + it.id) * 4;
  const fade = it.life < 3 ? (Math.sin(t * 18) > 0 ? 1 : 0.35) : 1;
  ctx.save(); ctx.translate(it.x, it.y); ctx.globalAlpha = fade;
  glow(ctx, 0, -14 + bob, 52, c, 0.55);
  drawBox(ctx, 0, 14 + bob, 34, 1, it.kind, t);
  ctx.restore();
}

// ---------- пули ----------
export function drawSlabBullet(ctx, b, t) {
  const sz = b.size, ang = Math.atan2(b.vy, b.vx);
  const heavy = sz > 1.4;
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(ang);
  // шлейф
  ctx.globalCompositeOperation = 'lighter';
  const tr = ctx.createLinearGradient(-46 * sz, 0, 0, 0); tr.addColorStop(0, 'rgba(255,170,60,0)'); tr.addColorStop(1, heavy ? 'rgba(255,200,90,0.75)' : 'rgba(255,200,110,0.6)');
  ctx.fillStyle = tr; ctx.beginPath(); ctx.moveTo(-46 * sz, 0); ctx.lineTo(0, -5 * sz); ctx.lineTo(0, 5 * sz); ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.rotate(Math.sin(t * 20 + b.id) * 0.12);
  rr(ctx, -12 * sz, -6 * sz, 24 * sz, 12 * sz, 2.5 * sz); ctx.fillStyle = vgrad(ctx, -6 * sz, 6 * sz, [[0, '#fffaf0'], [1, '#d6ccb8']]); ctx.fill();
  ctx.strokeStyle = heavy ? '#ffb347' : 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.strokeStyle = 'rgba(160,150,135,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-5 * sz, -5 * sz); ctx.lineTo(-1 * sz, 0); ctx.lineTo(-6 * sz, 5 * sz); ctx.stroke();
  ctx.restore();
  glow(ctx, b.x, b.y, 24 * sz, heavy ? '#ffc766' : '#ffd9a0', 0.55);
}

export function drawEnemyBullet(ctx, b, t) {
  ctx.save(); ctx.translate(b.x, b.y);
  if (b.kind === 'wave') {
    ctx.rotate(0); glow(ctx, 0, 0, 58, '#ff8a3a', 0.8);
    ctx.fillStyle = vgrad(ctx, -34, 34, [[0, '#ffe6a0'], [0.5, '#ff9a3a'], [1, '#c4430f']]);
    ctx.beginPath(); ctx.moveTo(10, -34); ctx.quadraticCurveTo(-22, -8, -12, 30); ctx.quadraticCurveTo(-4, 4, 10, -34); ctx.closePath(); ctx.fill();
    ctx.restore(); return;
  }
  const r = b.r, spin = t * 9 + b.id;
  glow(ctx, 0, 0, r * 3.4, '#ff6a30', 0.75);
  ctx.rotate(spin);
  ctx.beginPath(); for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, rad = r * (0.86 + 0.22 * Math.sin(i * 2.7 + b.id)); ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } ctx.closePath();
  ctx.fillStyle = b.kind === 'blob' ? vgrad(ctx, -r, r, [[0, '#a79d8c'], [1, '#645d52']]) : vgrad(ctx, -r, r, [[0, '#8d9098'], [1, '#43464d']]); ctx.fill();
  ctx.strokeStyle = '#ff9a4a'; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.restore();
}

// ---------- боссы ----------
function tracks(ctx, x, w, h, off) {
  rr(ctx, x, -h, w, h, h / 2); ctx.fillStyle = '#1d1f24'; ctx.fill();
  ctx.save(); rr(ctx, x, -h, w, h, h / 2); ctx.clip();
  ctx.fillStyle = '#2f3238'; for (let i = -1; i < w / 14 + 1; i++) ctx.fillRect(x + ((i * 14 + off) % (w + 14)), -h, 7, h);
  ctx.restore();
  for (let i = 0; i < 4; i++) { const cx = x + h / 2 + i * (w - h) / 3; ctx.fillStyle = '#5b5f68'; ctx.beginPath(); ctx.arc(cx, -h / 2, h * 0.32, 0, TAU); ctx.fill(); ctx.fillStyle = '#2a2c32'; ctx.beginPath(); ctx.arc(cx, -h / 2, h * 0.13, 0, TAU); ctx.fill(); }
}
function eyes(ctx, x, y, t, rage) {
  glow(ctx, x, y, 40 + rage * 18, '#ff3a22', 0.7 + rage * 0.3);
  ctx.fillStyle = '#fff0b0'; ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fill(); ctx.fillStyle = '#c4220e'; ctx.beginPath(); ctx.arc(x - 1, y, 4.2, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#17181b'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 14, y - 12); ctx.lineTo(x + 12, y - 5); ctx.stroke();
}
function stripes(ctx, x, y, w, h, off = 0) {
  ctx.save(); rr(ctx, x, y, w, h, 3); ctx.clip();
  for (let i = -2; i < w / 14 + 2; i++) { ctx.fillStyle = i % 2 ? '#15171b' : '#f2b62b'; ctx.beginPath(); ctx.moveTo(x + i * 14 + off, y + h); ctx.lineTo(x + i * 14 + 7 + off, y + h); ctx.lineTo(x + i * 14 + 7 + h + off, y); ctx.lineTo(x + i * 14 + h + off, y); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
function smoke(ctx, x, y, t, n = 3) { for (let i = 0; i < n; i++) { const k = ((t * 0.9 + i / n) % 1); ctx.fillStyle = `rgba(210,208,205,${0.38 * (1 - k)})`; ctx.beginPath(); ctx.arc(x + Math.sin(k * 5 + i) * 6 - k * 18, y - k * 60, 7 + k * 18, 0, TAU); ctx.fill(); } }

export function drawBoss(ctx, b, t, game) {
  const rage = 1 - b.hp / b.maxHp;
  ctx.save();
  if (b.state === 'dying') ctx.translate((Math.random() - 0.5) * 4, 0);
  const off = (b.x * 0.4) % 14;
  if (b.kind === 0) bossPaver(ctx, b, t, rage, off);
  else if (b.kind === 1) bossMixer(ctx, b, t, rage, off);
  else if (b.kind === 2) bossRoller(ctx, b, t, rage, off);
  else bossExcavator(ctx, b, t, rage, off);
  if (b.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; if (b.kind === 0) bossPaver(ctx, b, t, rage, off); else if (b.kind === 1) bossMixer(ctx, b, t, rage, off); else if (b.kind === 2) bossRoller(ctx, b, t, rage, off); else bossExcavator(ctx, b, t, rage, off); }
  ctx.restore();
}

function bossPaver(ctx, b, t, rage, off) {
  tracks(ctx, -140, 270, 50, off);
  rr(ctx, -135, -130, 255, 80, 10); ctx.fillStyle = vgrad(ctx, -130, -50, [[0, '#ffc245'], [0.5, '#f29a1c'], [1, '#bd6d10']]); ctx.fill();
  stripes(ctx, -135, -62, 255, 12, 0);
  // бункер впереди (слева)
  ctx.beginPath(); ctx.moveTo(-165, -170); ctx.lineTo(-80, -150); ctx.lineTo(-90, -100); ctx.lineTo(-150, -105); ctx.closePath();
  ctx.fillStyle = vgrad(ctx, -170, -100, [[0, '#7c8088'], [1, '#42454c']]); ctx.fill();
  ctx.fillStyle = '#0d0e11'; ctx.beginPath(); ctx.moveTo(-160, -165); ctx.quadraticCurveTo(-120, -190, -86, -150); ctx.lineTo(-100, -140); ctx.quadraticCurveTo(-125, -160, -152, -148); ctx.closePath(); ctx.fill();
  glow(ctx, -118, -158, 60, '#ff7a30', 0.4 + rage * 0.3);
  // кабина
  rr(ctx, 40, -190, 80, 62, [10, 10, 2, 2]); ctx.fillStyle = vgrad(ctx, -190, -128, [[0, '#ffc95a'], [1, '#e48a14']]); ctx.fill();
  rr(ctx, 50, -182, 50, 38, 6); ctx.fillStyle = '#10151e'; ctx.fill(); ctx.fillStyle = 'rgba(180,210,255,0.2)'; ctx.beginPath(); ctx.moveTo(54, -180); ctx.lineTo(76, -180); ctx.lineTo(60, -148); ctx.lineTo(54, -148); ctx.closePath(); ctx.fill();
  // труба и дым
  rr(ctx, 96, -226, 14, 50, 3); ctx.fillStyle = '#2f3238'; ctx.fill(); smoke(ctx, 103, -226, t);
  eyes(ctx, -138, -118, t, rage);
  ctx.fillStyle = '#16181c'; rr(ctx, -150, -126, 20, 4, 2); ctx.fill();
  if (rage > 0.5) smoke(ctx, -60, -132, t + 0.3, 2);
}

function bossMixer(ctx, b, t, rage, off) {
  // шасси и колёса
  rr(ctx, -150, -60, 300, 22, 6); ctx.fillStyle = '#2a2d33'; ctx.fill();
  for (const cx of [-110, 40, 100]) { ctx.fillStyle = '#18191d'; ctx.beginPath(); ctx.arc(cx, -30, 32, 0, TAU); ctx.fill(); ctx.fillStyle = '#7b7f87'; ctx.beginPath(); ctx.arc(cx, -30, 15, 0, TAU); ctx.fill(); ctx.save(); ctx.translate(cx, -30); ctx.rotate(b.x * 0.03); ctx.fillStyle = '#3a3d44'; for (let i = 0; i < 5; i++) { ctx.rotate(TAU / 5); ctx.fillRect(6, -1.5, 8, 3); } ctx.restore(); }
  // кабина
  rr(ctx, -165, -150, 80, 96, [12, 12, 3, 3]); ctx.fillStyle = vgrad(ctx, -150, -54, [[0, '#ffc245'], [1, '#d77f12']]); ctx.fill();
  rr(ctx, -156, -140, 56, 44, 7); ctx.fillStyle = '#10151e'; ctx.fill(); ctx.fillStyle = 'rgba(180,210,255,0.2)'; ctx.beginPath(); ctx.moveTo(-152, -138); ctx.lineTo(-128, -138); ctx.lineTo(-146, -98); ctx.lineTo(-152, -98); ctx.closePath(); ctx.fill();
  eyes(ctx, -160, -116, t, rage);
  // барабан
  ctx.save(); ctx.translate(30, -110); ctx.rotate(-0.28);
  const drum = new Path2D(); drum.ellipse(0, 0, 118, 64, 0, 0, TAU);
  ctx.save(); ctx.clip(drum);
  ctx.fillStyle = vgrad(ctx, -64, 64, [[0, '#c9ccd2'], [0.5, '#8c9098'], [1, '#4f535b']]); ctx.fillRect(-120, -66, 240, 132);
  const sp = (t * 70 + b.x * 0.2);
  for (let i = -6; i < 8; i++) { ctx.fillStyle = 'rgba(242,182,43,0.85)'; ctx.beginPath(); const x0 = i * 34 + (sp % 34); ctx.moveTo(x0, -66); ctx.lineTo(x0 + 14, -66); ctx.lineTo(x0 + 14 - 44, 66); ctx.lineTo(x0 - 44, 66); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(-118, -60, 236, 14);
  ctx.restore();
  ctx.strokeStyle = '#2a2d33'; ctx.lineWidth = 4; ctx.stroke(drum);
  ctx.restore();
  // лоток
  ctx.fillStyle = '#6b6f77'; ctx.beginPath(); ctx.moveTo(130, -150); ctx.lineTo(166, -120); ctx.lineTo(158, -108); ctx.lineTo(122, -136); ctx.closePath(); ctx.fill();
  if (rage > 0.4) smoke(ctx, -60, -150, t, 2);
}

function bossRoller(ctx, b, t, rage, off) {
  const spin = b.x * 0.012;
  // барабан спереди
  ctx.save(); ctx.translate(-105, -66);
  ctx.fillStyle = rgrad(ctx, -14, -18, 4, 74, [[0, '#e0e3e8'], [0.45, '#959aa3'], [1, '#4c5058']]); ctx.beginPath(); ctx.arc(0, 0, 66, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 66, 0, TAU); ctx.stroke();
  ctx.rotate(spin); ctx.fillStyle = '#383b42'; for (let i = 0; i < 10; i++) { ctx.rotate(TAU / 10); ctx.beginPath(); ctx.arc(44, 0, 4, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#2e3138'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.fill();
  ctx.restore();
  // рама и корпус
  rr(ctx, -100, -118, 220, 62, 10); ctx.fillStyle = vgrad(ctx, -118, -56, [[0, '#ffc245'], [0.5, '#f29a1c'], [1, '#bd6d10']]); ctx.fill();
  stripes(ctx, -100, -66, 220, 10, 0);
  rr(ctx, 30, -190, 90, 74, [12, 12, 3, 3]); ctx.fillStyle = vgrad(ctx, -190, -116, [[0, '#ffc95a'], [1, '#e48a14']]); ctx.fill();
  rr(ctx, 42, -180, 62, 44, 7); ctx.fillStyle = '#10151e'; ctx.fill(); ctx.fillStyle = 'rgba(180,210,255,0.2)'; ctx.beginPath(); ctx.moveTo(46, -178); ctx.lineTo(70, -178); ctx.lineTo(52, -140); ctx.lineTo(46, -140); ctx.closePath(); ctx.fill();
  // колесо сзади
  ctx.save(); ctx.translate(80, -52); ctx.fillStyle = '#1d1f24'; ctx.beginPath(); ctx.arc(0, 0, 54, 0, TAU); ctx.fill(); ctx.fillStyle = '#6e727a'; ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.fill(); ctx.rotate(spin * 0.8); ctx.fillStyle = '#34373d'; for (let i = 0; i < 6; i++) { ctx.rotate(TAU / 6); ctx.fillRect(8, -2.5, 16, 5); } ctx.restore();
  eyes(ctx, -92, -112, t, rage);
  rr(ctx, 100, -228, 12, 46, 3); ctx.fillStyle = '#2f3238'; ctx.fill(); smoke(ctx, 106, -228, t);
  if (b.atk === 'charge') { for (let i = 0; i < 4; i++) { ctx.fillStyle = `rgba(255,200,120,${0.5 - i * 0.1})`; ctx.fillRect(130 + i * 26, -20 - i * 6, 20, 3); } }
}

function bossExcavator(ctx, b, t, rage, off) {
  tracks(ctx, -110, 230, 54, off);
  // поворотная платформа и кабина
  rr(ctx, -80, -122, 180, 66, 10); ctx.fillStyle = vgrad(ctx, -122, -56, [[0, '#ffc245'], [0.5, '#f29a1c'], [1, '#bd6d10']]); ctx.fill();
  stripes(ctx, -80, -66, 180, 10, 0);
  rr(ctx, -70, -176, 86, 62, [12, 12, 3, 3]); ctx.fillStyle = vgrad(ctx, -176, -114, [[0, '#ffc95a'], [1, '#e48a14']]); ctx.fill();
  rr(ctx, -62, -168, 56, 40, 7); ctx.fillStyle = '#10151e'; ctx.fill(); ctx.fillStyle = 'rgba(180,210,255,0.2)'; ctx.beginPath(); ctx.moveTo(-58, -166); ctx.lineTo(-34, -166); ctx.lineTo(-52, -130); ctx.lineTo(-58, -130); ctx.closePath(); ctx.fill();
  rr(ctx, 74, -140, 40, 28, 4); ctx.fillStyle = '#35383e'; ctx.fill();                // противовес
  // стрела: два звена, ковш; углы зависят от атаки
  const swing = b.atk === 'swing' ? Math.sin(Math.min(1, (b.cycle || 0)) * 3) : 0;
  const a1 = -0.95 + Math.sin(t * 1.2) * 0.12, a2 = 1.25 + Math.sin(t * 1.7) * 0.18 + swing * 0.3;
  ctx.save(); ctx.translate(-72, -140); ctx.rotate(a1 - Math.PI * 0.0);
  ctx.save(); ctx.scale(-1, 1); // стрела направлена влево
  rr(ctx, -6, -9, 112, 18, 6); ctx.fillStyle = vgrad(ctx, -9, 9, [[0, '#ffc245'], [1, '#c4730f']]); ctx.fill();
  ctx.translate(104, 0); ctx.rotate(a2);
  rr(ctx, -6, -7, 88, 14, 5); ctx.fillStyle = vgrad(ctx, -7, 7, [[0, '#ffbf45'], [1, '#b8680e']]); ctx.fill();
  ctx.translate(82, 0); ctx.rotate(0.7);
  ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(44, -14); ctx.lineTo(54, 14); ctx.lineTo(-4, 24); ctx.closePath(); ctx.fillStyle = vgrad(ctx, -14, 24, [[0, '#9a9ea6'], [1, '#41444b']]); ctx.fill();
  ctx.fillStyle = '#d9dce2'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(44 + i * 3, -12 + i * 8); ctx.lineTo(60 + i * 3, -9 + i * 8); ctx.lineTo(46 + i * 3, -5 + i * 8); ctx.closePath(); ctx.fill(); }
  ctx.restore(); ctx.restore();
  eyes(ctx, -58, -148, t, rage);
  smoke(ctx, 100, -146, t, 2);
}
