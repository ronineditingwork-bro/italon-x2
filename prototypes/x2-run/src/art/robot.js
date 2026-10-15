// Робот X2: рисуется кодом, каждый кадр, из частей с суставами. Начало координат — центр ступней на земле, вверх — минус Y.
// Смотрит вправо; влево — зеркальное отражение (scale(-1, 1)). Размеры подобраны под хитбокс 34×92.
import { TAU, rr, vgrad, hgrad, rgrad, glow, clamp, lerp } from './util.js';

const C = {
  cream: '#ece4d4', creamHi: '#faf5ea', creamLo: '#c9bfab', creamDeep: '#a99f8b',
  limb: '#d9d2c2', limbLo: '#aaa291', dark: '#252a33', darker: '#171b22', orange: '#f28a26', orangeHi: '#ffb257', orangeLo: '#c4650f',
  visor: '#0a101c', eye: '#79edff', kraft: '#cf9650', kraftHi: '#e2ae6c', kraftLo: '#a8703a',
};

function disc(ctx, x, y, r, fill, ring) {
  ctx.fillStyle = ring || C.dark; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, TAU); ctx.fill();
}

/** Сегмент конечности от (x,y) под углом a (0 — вниз, плюс — вперёд) длиной len и толщиной w. Возвращает конец. */
function seg(ctx, x, y, a, len, w, fill) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-a);
  rr(ctx, -w / 2, -w * 0.35, w, len + w * 0.7, w / 2);
  ctx.fillStyle = fill || vgrad(ctx, 0, len, [[0, C.limb], [1, C.limbLo]]); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; rr(ctx, -w * 0.32, 0, w * 0.22, len, w * 0.11); ctx.fill();
  ctx.restore();
  return [x + Math.sin(a) * len, y + Math.cos(a) * len];
}

function foot(ctx, x, y, ang, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-ang); ctx.scale(scale, 1);
  // клиновидная ступня: светлая верхушка, тёмная подошва, оранжевый носок
  ctx.beginPath(); ctx.moveTo(-9, -4); ctx.quadraticCurveTo(-11, 7, -7, 8); ctx.lineTo(17, 8); ctx.quadraticCurveTo(21, 8, 19, 3); ctx.quadraticCurveTo(12, -3, 4, -6); ctx.quadraticCurveTo(-3, -9, -9, -4); ctx.closePath();
  ctx.fillStyle = vgrad(ctx, -8, 9, [[0, C.creamHi], [1, C.creamLo]]); ctx.fill();
  ctx.fillStyle = C.dark; rr(ctx, -9, 5.5, 29, 3.6, 1.8); ctx.fill();
  ctx.fillStyle = C.orange; rr(ctx, 11, 1, 8, 5, 2.5); ctx.fill();
  ctx.restore();
}

function leg(ctx, hx, hy, thigh, bend, side) {
  const [kx, ky] = seg(ctx, hx, hy, thigh, 24, 8.6);
  const [ax, ay] = seg(ctx, kx, ky, thigh - bend, 24, 7.4);
  disc(ctx, kx, ky, 6.2, C.orange);
  disc(ctx, ax, ay, 4.4, C.orange);
  foot(ctx, ax, ay, (thigh - bend) * 0.55 - 0.05);
  return [ax, ay];
}

function arm(ctx, sx, sy, a1, a2, hand = true) {
  const [ex, ey] = seg(ctx, sx, sy, a1, 15, 6.4);
  const [wx, wy] = seg(ctx, ex, ey, a2, 14, 5.6);
  disc(ctx, ex, ey, 4.4, C.dark, C.darker);
  if (hand) {
    ctx.save(); ctx.translate(wx, wy); ctx.rotate(-a2);
    rr(ctx, -4.6, -2, 9.2, 7, 3); ctx.fillStyle = C.dark; ctx.fill();
    for (const k of [-1, 0, 1]) { ctx.save(); ctx.rotate(k * 0.28); rr(ctx, k * 3.1 - 1.1, 4, 2.2, 8, 1.1); ctx.fillStyle = C.darker; ctx.fill(); ctx.restore(); }
    ctx.restore();
  }
  disc(ctx, sx, sy, 7.4, C.creamHi, C.dark);
  ctx.fillStyle = C.orange; ctx.beginPath(); ctx.arc(sx, sy, 2.6, 0, TAU); ctx.fill();
}

/**
 * r: { facing, t, run, vx, vy, onGround, crouch, aim (угол в мировых координатах), flash (0..1), hurt, shield, feed (0..1), blink }
 */
export function drawRobot(ctx, r) {
  const air = !r.onGround, moving = Math.abs(r.vx) > 25 && !r.crouch;
  const ph = r.run;
  const idleBob = !moving && !air ? Math.sin(r.t * 2.4) * 1.1 : 0;
  const bob = moving && !air ? Math.abs(Math.cos(ph)) * 3.4 : idleBob;
  const crouchDrop = r.crouch ? 22 : 0;
  const lean = (moving ? 0.1 : 0) + (r.crouch ? 0.22 : 0) + (air ? (r.vy < 0 ? 0.04 : -0.06) : 0) - r.hurt * 0.35;

  // локальный угол прицела: при взгляде влево отражаем по X
  let a = r.aim; if (r.facing < 0) a = Math.PI - a;
  a = Math.atan2(Math.sin(a), Math.cos(a));

  ctx.save();
  ctx.scale(r.facing, 1);

  const hipY = -50 + crouchDrop * 0.9 - bob * 0.6;
  const hipX = 0;

  // ---- дальняя нога и рука
  const swing = moving && !air ? ph : 0;
  let thighA = moving && !air ? Math.sin(swing + Math.PI) * 0.95 : 0.1, bendA = moving && !air ? 0.2 + Math.max(0, Math.cos(swing + Math.PI + 0.2)) * 1.05 : 0.1;
  let thighB = moving && !air ? Math.sin(swing) * 0.95 : -0.05, bendB = moving && !air ? 0.2 + Math.max(0, Math.cos(swing + 0.2)) * 1.05 : 0.1;
  if (air) { thighA = 0.55; bendA = 0.9; thighB = -0.35; bendB = 0.5; if (r.vy > 120) { thighA = 0.35; bendA = 0.5; thighB = 0.1; bendB = 0.3; } }
  if (r.crouch) { thighA = 1.0; bendA = 1.9; thighB = 0.85; bendB = 1.7; }
  if (!moving && !air && !r.crouch) { thighA = 0.12; bendA = 0.12; thighB = -0.06; bendB = 0.08; }

  // коробка и подача плит — за спиной
  const px = -6, py = hipY - 30;
  ctx.save(); ctx.translate(px, py); ctx.rotate(-lean * 0.7);
  drawPack(ctx, r);
  ctx.restore();

  leg(ctx, hipX - 2, hipY, thighA, bendA);
  // дальняя рука
  const armSw = moving && !air ? Math.sin(swing) * 0.9 : (air ? -0.4 : 0.05);
  arm(ctx, 0, hipY - 20, -armSw * 0.6 - 0.1 + lean, -armSw * 0.8 - 0.5, true);

  // ---- корпус
  ctx.save(); ctx.translate(hipX, hipY); ctx.rotate(lean);
  rr(ctx, -12, -4, 24, 11, 4); ctx.fillStyle = C.dark; ctx.fill();                               // таз
  rr(ctx, -13, -30, 26, 30, [9, 9, 7, 7]);                                                       // грудь
  ctx.fillStyle = hgrad(ctx, -13, 13, [[0, C.creamHi], [0.55, C.cream], [1, C.creamLo]]); ctx.fill();
  rr(ctx, 1, -23, 10, 8, 2.5); ctx.fillStyle = C.dark; ctx.fill();                                // нагрудная панель
  ctx.fillStyle = r.hurt > 0 ? '#ff4d3a' : C.orange; ctx.beginPath(); ctx.arc(6, -19, 1.9, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; rr(ctx, -10, -27, 3, 20, 1.5); ctx.fill();
  rr(ctx, -4, -37, 8, 9, 2); ctx.fillStyle = C.dark; ctx.fill();                                  // шея

  // ---- голова
  ctx.save(); ctx.translate(3, -53); ctx.rotate(Math.sin(a) * 0.22 * (Math.cos(a) >= 0 ? 1 : -1) - lean * 0.6);
  drawHead(ctx, r, a);
  ctx.restore();
  ctx.restore();

  // ---- ближняя нога
  leg(ctx, hipX + 2, hipY, thighB, bendB);

  // ---- ближняя рука с пусковой установкой
  const sx = 3 + Math.sin(lean) * 4, sy = hipY - 21;
  drawLauncher(ctx, sx, sy, a, r);

  ctx.restore();
}

function drawPack(ctx, r) {
  // коробка X2 на спине: крафт, ремни, ромб с надписью
  const w = 40, h = 42, x = -w - 1, y = -h / 2 - 2;
  rr(ctx, x, y, w, h, 3);
  ctx.fillStyle = vgrad(ctx, y, y + h, [[0, C.kraftHi], [0.5, C.kraft], [1, C.kraftLo]]); ctx.fill();
  ctx.strokeStyle = 'rgba(90,55,20,0.55)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = 'rgba(255,240,200,0.28)'; ctx.fillRect(x + 1, y + 1, w - 2, 3);                 // свет на кромке
  ctx.fillStyle = 'rgba(50,30,10,0.18)'; ctx.fillRect(x + 2, y + h * 0.42, w - 4, 2);            // шов
  // ремни
  for (const sx of [x + 6, x + w - 9]) { ctx.fillStyle = C.dark; ctx.fillRect(sx, y - 2, 3.4, h + 4); ctx.fillStyle = C.limb; rr(ctx, sx - 0.8, y + h * 0.58, 5, 4.4, 1); ctx.fill(); }
  // ромб X2
  ctx.save(); ctx.translate(x + w / 2 - 1, y + h / 2 - 1); ctx.strokeStyle = '#171717'; ctx.lineWidth = 2.6; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(11, 0); ctx.lineTo(0, 11); ctx.lineTo(-11, 0); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = '#171717'; ctx.font = '900 10px "Arial Black", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('X2', 0, 0.5);
  ctx.restore();
  // механизм подачи снизу
  rr(ctx, x + 2, y + h - 1, w - 6, 8, 2); ctx.fillStyle = C.dark; ctx.fill();
  ctx.fillStyle = r.feed > 0 ? C.orangeHi : C.orange; ctx.fillRect(x + 6, y + h + 3, w - 14, 1.6);
  if (r.feed > 0) {                                                                                // плита выезжает назад и вниз
    const k = r.feed;
    ctx.save(); ctx.translate(x + 4 - k * 14, y + h + 2 + k * 3); ctx.rotate(k * 0.35);
    rr(ctx, 0, 0, 26, 5, 1.5); ctx.fillStyle = vgrad(ctx, 0, 5, [[0, '#fbf6ec'], [1, '#c8bfae']]); ctx.fill(); ctx.restore();
  }
}

function drawHead(ctx, r, a) {
  // каркас головы
  rr(ctx, -20, -17, 40, 33, 11);
  ctx.fillStyle = hgrad(ctx, -20, 20, [[0, C.creamLo], [0.3, C.cream], [0.7, C.creamHi], [1, C.cream]]); ctx.fill();
  // верхняя накладка
  rr(ctx, -16, -20.5, 31, 9, 5); ctx.fillStyle = vgrad(ctx, -21, -11, [[0, C.creamHi], [1, C.cream]]); ctx.fill();
  ctx.strokeStyle = 'rgba(120,108,88,0.4)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-17, -11.2); ctx.lineTo(16, -11.2); ctx.stroke();
  // визор
  rr(ctx, 1, -11, 20.5, 22, 8); ctx.fillStyle = vgrad(ctx, -11, 11, [[0, '#1b2638'], [0.5, C.visor], [1, '#05080f']]); ctx.fill();
  ctx.strokeStyle = 'rgba(160,190,230,0.35)'; ctx.lineWidth = 1; rr(ctx, 1.8, -10.2, 18.9, 20.4, 7.4); ctx.stroke();
  ctx.fillStyle = 'rgba(190,215,255,0.16)'; ctx.beginPath(); ctx.moveTo(3, -9); ctx.lineTo(13, -9); ctx.lineTo(5.5, 9); ctx.lineTo(3, 9); ctx.closePath(); ctx.fill();
  // глаза
  const blink = r.blink || 0, eh = 11 * (1 - blink * 0.85), ec = r.hurt > 0 ? '#ff7a6a' : C.eye;
  glow(ctx, 11.5, -0.5, 22, ec, 0.55);
  ctx.fillStyle = ec; rr(ctx, 6, -0.5 - eh / 2, 4.2, eh, 2.1); ctx.fill(); rr(ctx, 13.4, -0.5 - eh / 2, 4.2, eh, 2.1); ctx.fill();
  // ухо
  ctx.fillStyle = C.dark; ctx.beginPath(); ctx.arc(-7, 1.5, 8, 0, TAU); ctx.fill();
  ctx.fillStyle = C.orange; ctx.beginPath(); ctx.arc(-7, 1.5, 4.4, 0, TAU); ctx.fill();
  ctx.fillStyle = C.orangeHi; ctx.beginPath(); ctx.arc(-8.2, 0.3, 1.5, 0, TAU); ctx.fill();
}

function drawLauncher(ctx, sx, sy, a, r) {
  // плечо → пусковая установка вдоль направления прицела
  ctx.save(); ctx.translate(sx, sy);
  const len = 16;
  const ex = Math.cos(a) * len, ey = Math.sin(a) * len;
  // предплечье
  ctx.save(); ctx.rotate(a);
  rr(ctx, 0, -3.4, len + 3, 6.8, 3.4); ctx.fillStyle = vgrad(ctx, -3.4, 3.4, [[0, C.limb], [1, C.limbLo]]); ctx.fill();
  ctx.restore();
  disc(ctx, ex, ey, 4.6, C.dark, C.darker);
  // ствол
  ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
  const recoil = r.flash > 0 ? -3 * r.flash : 0;
  ctx.translate(recoil, 0);
  rr(ctx, -4, -7, 32, 14, 4); ctx.fillStyle = vgrad(ctx, -7, 7, [[0, '#3a414d'], [0.5, C.dark], [1, C.darker]]); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; rr(ctx, -2, -6, 28, 2.4, 1.2); ctx.fill();
  ctx.fillStyle = C.orange; rr(ctx, 13, -7.6, 4.6, 15.2, 1.5); ctx.fill();
  ctx.fillStyle = C.orangeHi; ctx.fillRect(14, -7, 1.2, 14);
  // щель, откуда выезжает плита
  ctx.fillStyle = '#0a0d12'; rr(ctx, 22, -4.2, 7, 8.4, 2); ctx.fill();
  ctx.fillStyle = r.flash > 0 ? '#fff2c0' : '#6a4a22'; rr(ctx, 23.4, -2.6, 5, 5.2, 1.4); ctx.fill();
  ctx.restore();
  // кисть-«плечо» с оранжевым диском
  disc(ctx, 0, 0, 7.4, C.creamHi, C.dark);
  ctx.fillStyle = C.orange; ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, TAU); ctx.fill();
  // вспышка выстрела
  if (r.flash > 0) {
    const k = r.flash, mx = ex + Math.cos(a) * 33, my = ey + Math.sin(a) * 33;
    glow(ctx, mx, my, 46 * (0.7 + k), '#ffcf70', 0.95 * k);
    ctx.save(); ctx.translate(mx, my); ctx.rotate(a); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,236,170,${0.9 * k})`;
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(8, -5); ctx.lineTo(26 * k + 6, 0); ctx.lineTo(8, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** Пузырь щита. */
export function drawShield(ctx, t, k = 1) {
  ctx.save(); ctx.translate(0, -50);
  const pulse = 1 + Math.sin(t * 8) * 0.025;
  ctx.scale(pulse, pulse);
  ctx.fillStyle = rgrad(ctx, 0, 0, 20, 62, [[0, 'rgba(110,233,255,0.0)'], [0.75, 'rgba(110,233,255,0.14)'], [1, 'rgba(160,245,255,0.5)']]);
  ctx.globalAlpha = clamp(k, 0, 1);
  ctx.beginPath(); ctx.ellipse(0, 0, 46, 62, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(200,250,255,0.75)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}
