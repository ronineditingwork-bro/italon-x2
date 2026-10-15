// Отрисовка: слои фона, дорожка, сущности, частицы, свет. Читает состояние игры и события, правил не знает.
import { CONFIG } from './config.js';
import { TAU, rr, vgrad, rgrad, glow, alpha, clamp, lerp, hash, Q } from './art/util.js';
import { drawRobot, drawShield } from './art/robot.js';
import * as E from './art/enemies.js';
import { Scenery } from './art/scenery.js';
import { Ground, BAND } from './art/ground.js';

const TL = CONFIG.lay.tileLen;
const KIND_COLORS = { runner: ['#8b8e96', '#5f626a', '#ffa14a'], flyer: ['#a8acb4', '#70747d', '#ff7a4a'], turret: ['#8a8e96', '#4b4e55', '#ff7a4a'], heavy: ['#ffbf45', '#f29a1c', '#8b8e96'], drone: ['#fbf6ec', '#c8bfae', '#cf9650'] };
const fmt = v => v.toFixed(2).replace('.', ',');

export class Renderer {
  constructor(canvas, game, quality = 'high') {
    this.canvas = canvas; this.game = game; this.quality = quality;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.t = 0; this.shake = 0; this.flash = { c: '#ff3a2a', a: 0 };
    this.parts = []; this.flights = []; this.feedT = 0; this.blinkT = 2; this.blink = 0;
    this.shownLaidX = game.laidX; this.disposed = false;
    Q.glow = quality === 'high';
    this.maxParts = quality === 'high' ? 420 : 160;
    this.resize();
    this.off = game.on(e => this.onEvent(e));
  }

  // ---------- размер ----------
  resize() {
    const c = this.canvas, cw = c.clientWidth || c.parentElement?.clientWidth || 1280, ch = c.clientHeight || c.parentElement?.clientHeight || 720;
    const aspect = cw / Math.max(1, ch), V = CONFIG.view;
    let W = clamp(V.baseH * aspect, V.minW, V.maxW), H = W / aspect;
    if (H < V.baseH) { H = V.baseH; W = H * aspect; }
    this.W = W; this.H = H; this.game.setView(W, H);
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : 1.25);
    c.width = Math.max(2, Math.round(cw * dpr)); c.height = Math.max(2, Math.round(ch * dpr));
    this.k = c.width / W;
    this.GY = H - (aspect < 0.9 ? V.groundFromBottom + H * 0.2 : V.groundFromBottom);
    const S = clamp(this.k, 0.7, 2);
    if (!this.assets || Math.abs(S - this.assetScale) / this.assetScale > 0.45) this.buildAssets(S);
  }

  buildAssets(S) {
    this.assetScale = S;
    this.scenery = new Scenery(S, this.game.level);
    this.ground = new Ground(S);
  }

  get assets() { return this.scenery; }

  // ---------- события ----------
  onEvent(e) {
    const g = this.game, p = g.player, GY = this.GY;
    switch (e.type) {
      case 'start': this.parts.length = 0; this.flights.length = 0; this.shownLaidX = g.laidX; this.shake = 0; this.flash.a = 0; break;
      case 'shoot': this.sparks(e.x, e.y, 3, '#ffd9a0', 220, 0.18); break;
      case 'enemyHit': this.sparks(e.x, e.y, 4, '#ffe6b0', 260, 0.22); break;
      case 'bossHit': this.sparks(e.x, e.y, 4, '#ffe6b0', 300, 0.25); break;
      case 'ping': this.sparks(e.x, e.y, 5, '#cfd3da', 320, 0.2); break;
      case 'kill': {
        const cs = KIND_COLORS[e.kind] || KIND_COLORS.runner;
        this.shards(e.x, e.y, e.kind === 'heavy' ? 14 : 8, cs); this.dust(e.x, e.y + 20, 4); this.ring(e.x, e.y, '#ffd9a0', 70);
        this.sparks(e.x, e.y, 8, cs[2], 380, 0.4);
        this.text(e.x, e.y - 30, `+${fmt(CONFIG.enemies[e.kind].bonus)} м²`, '#fff1c8');
        if (e.kind === 'heavy') this.addShake(6);
        break;
      }
      case 'hit': this.addShake(10); this.flash = { c: '#ff3a2a', a: 0.35 }; this.sparks(p.x, p.y - 50, 12, '#ff8a5a', 420, 0.5); break;
      case 'fall': this.addShake(8); this.flash = { c: '#ff3a2a', a: 0.3 }; break;
      case 'respawn': this.ring(p.x, p.y - 50, '#7bf29a', 90); break;
      case 'pickup': this.ring(e.x, e.y, '#ffffff', 90); this.sparks(e.x, e.y, 14, '#ffd27a', 360, 0.6); this.text(p.x, p.y - 110, E.ITEMS[e.kind]?.name ?? '', '#ffffff'); break;
      case 'lay': this.layTile(e); break;
      case 'land': this.dust(p.x, p.y, 3); break;
      case 'jump': this.dust(p.x, p.y, 2); break;
      case 'charge': this.dust(e.x, 0, 6); this.addShake(3); break;
      case 'splat': this.dust(e.x, 0, 5); this.sparks(e.x, -6, 6, '#a79d8c', 260, 0.35); break;
      case 'enemyShot': this.sparks(e.x, e.y, 3, '#ff9a4a', 160, 0.15); break;
      case 'explosion': this.explode(e.x, e.y, e.big); break;
      case 'shake': this.addShake(e.power); break;
      case 'bossStart': this.addShake(7); break;
      case 'bossDefeated': this.flash = { c: '#fff4d0', a: 0.7 }; this.addShake(14); break;
      case 'win': case 'over': break;
    }
  }

  addShake(a) { this.shake = Math.min(18, Math.max(this.shake, a)); }

  layTile(e) {
    const p = this.game.player, f = p.facing;
    this.feedT = 0.28;
    this.flights.push({ x0: p.x - 34 * f, y0: p.y - 28, x1: e.x + TL / 2, y1: -10, t: 0, dur: 0.28, tileX: e.x, rot: (Math.random() - 0.5) * 0.4 });
  }

  // ---------- частицы ----------
  push(o) { if (this.parts.length >= this.maxParts) this.parts.shift(); this.parts.push(o); }
  sparks(x, y, n, color, speed = 300, life = 0.4) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = speed * (0.3 + Math.random() * 0.7); this.push({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, g: 700, life: life * (0.6 + Math.random() * 0.8), max: life, size: 2 + Math.random() * 2.4, color }); } }
  dust(x, y, n) { for (let i = 0; i < n; i++) this.push({ type: 'dust', x: x + (Math.random() - 0.5) * 24, y: y - 4, vx: (Math.random() - 0.5) * 90, vy: -30 - Math.random() * 40, g: 0, life: 0.5 + Math.random() * 0.3, max: 0.7, size: 8 + Math.random() * 8, color: '#d9cdb8' }); }
  ring(x, y, color, r) { this.push({ type: 'ring', x, y, vx: 0, vy: 0, g: 0, life: 0.45, max: 0.45, size: r, color }); }
  text(x, y, str, color) { this.push({ type: 'text', x, y, vx: 0, vy: -46, g: 0, life: 1.1, max: 1.1, size: 22, color, str }); }
  shards(x, y, n, cs) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 120 + Math.random() * 360; this.push({ type: 'shard', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 240, g: 1400, life: 0.8 + Math.random() * 0.5, max: 1.2, size: 6 + Math.random() * 12, color: cs[i % 2], rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 16, pts: 3 + (Math.random() * 3 | 0) }); } }
  explode(x, y, big) {
    this.push({ type: 'fire', x, y, vx: 0, vy: 0, g: 0, life: big ? 0.9 : 0.5, max: big ? 0.9 : 0.5, size: big ? 190 : 80, color: '#ffb24a' });
    this.sparks(x, y, big ? 40 : 14, '#ffd27a', big ? 620 : 380, big ? 0.9 : 0.5);
    for (let i = 0; i < (big ? 8 : 3); i++) this.push({ type: 'smoke', x: x + (Math.random() - 0.5) * 70, y: y + (Math.random() - 0.5) * 40, vx: (Math.random() - 0.5) * 70, vy: -50 - Math.random() * 70, g: 0, life: 1.1, max: 1.1, size: 28 + Math.random() * 34, color: '#8d8a86' });
    this.shards(x, y, big ? 12 : 4, ['#ffbf45', '#6c7079']);
    this.addShake(big ? 12 : 4);
  }

  // ---------- кадр ----------
  update(dt) {
    if (this.disposed) return;
    const ts = this.game.timeScale || 1; dt *= ts;
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 28);
    this.flash.a = Math.max(0, this.flash.a - dt * 1.6);
    if (this.feedT > 0) this.feedT -= dt;
    this.blinkT -= dt; if (this.blinkT < 0) { this.blink = 1; this.blinkT = 2 + Math.random() * 3; } else this.blink = Math.max(0, this.blink - dt * 7);
    // частицы
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i]; q.life -= dt; if (q.life <= 0) { this.parts.splice(i, 1); continue; }
      q.vy += (q.g || 0) * dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.rot !== undefined) q.rot += q.vr * dt;
      if (q.type === 'dust' || q.type === 'smoke') { q.vx *= 0.97; q.size += dt * (q.type === 'smoke' ? 30 : 14); }
    }
    // летящие плиты
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i]; f.t += dt;
      if (f.t >= f.dur) {
        this.shownLaidX = Math.max(this.shownLaidX, f.tileX + TL);
        this.dust(f.x1, -6, 2); this.sparks(f.x1, -14, 5, '#ffe2a0', 200, 0.3);
        this.flights.splice(i, 1);
      }
    }
    if (this.game.phase === 'menu' || this.game.phase === 'over') this.shownLaidX = Math.max(this.shownLaidX, this.game.laidX);
    // дым у раненого босса
    const b = this.game.boss;
    if (b && b.state !== 'enter' && b.hp / b.maxHp < 0.5 && Math.random() < 0.25) this.push({ type: 'smoke', x: b.x + (Math.random() - 0.5) * b.w * 0.6, y: b.y - b.h * 0.6, vx: -20, vy: -60, g: 0, life: 1, max: 1, size: 16, color: '#6d6a66' });
  }

  draw() {
    if (this.disposed) return;
    const ctx = this.ctx, g = this.game, W = this.W, H = this.H, GY = this.GY, k = this.k;
    const camX = g.cam.x - (g.phase === 'menu' && this.W / this.H > 1.3 ? this.W * 0.42 : 0);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    const sh = this.shake, sx = sh ? (Math.random() - 0.5) * sh : 0, sy = sh ? (Math.random() - 0.5) * sh : 0;
    ctx.save(); ctx.translate(sx, sy);

    this.scenery.drawSky(ctx, W, H, GY, camX, this.t);
    this.scenery.drawFar(ctx, W, GY, camX);
    this.scenery.drawMid(ctx, W, GY, camX);
    this.scenery.drawNear(ctx, W, GY, camX);
    this.scenery.drawBack(ctx, W, GY, camX);
    // бордюр между клумбой и дорожкой
    ctx.fillStyle = vgrad(ctx, GY + BAND.far - 6, GY + BAND.far + 6, [[0, '#f2ecdf'], [1, '#bdb5a3']]); ctx.fillRect(-20, GY + BAND.far - 6, W + 40, 8);
    this.ground.draw(ctx, W, H, GY, camX, g, this.shownLaidX, this.t);

    // уступы
    for (const l of g.level.ledges) {
      const x0 = l.x0 - camX; if (x0 > W + 30 || l.x1 - camX < -30) continue;
      const s = this.scenery.ledgeSprite(l);
      ctx.fillStyle = 'rgba(0,0,0,0.26)'; ctx.beginPath(); ctx.ellipse((x0 + l.x1 - camX) / 2 + 8, GY + 12, (l.x1 - l.x0) / 2 + 14, 9, 0, 0, TAU); ctx.fill();
      ctx.drawImage(s.canvas, x0, GY - l.h, s.w, s.h);
    }

    // предметы и враги
    for (const it of g.items) { if (it.x - camX < -60 || it.x - camX > W + 60) continue; ctx.save(); ctx.translate(it.x - camX, GY + it.y + 0); E.drawItem(ctx, { ...it, x: 0, y: 0 }, this.t); ctx.restore(); }
    for (const e of g.enemies) {
      const x = e.x - camX; if (x < -140 || x > W + 140) continue;
      if (!e.air) this.shadow(ctx, e.x, e.y, e.w * 0.9, camX);
      ctx.save(); ctx.translate(x, GY + e.y); const es = CONFIG.enemies[e.type].scale || 1; ctx.scale(es, es);
      if (e.type === 'runner') E.drawRunner(ctx, e, this.t);
      else if (e.type === 'flyer') E.drawFlyer(ctx, e, this.t);
      else if (e.type === 'turret') E.drawTurret(ctx, e, this.t);
      else if (e.type === 'heavy') E.drawHeavy(ctx, e, this.t);
      else if (e.type === 'drone') E.drawDrone(ctx, e, this.t);
      if (e.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55; if (e.type === 'runner') E.drawRunner(ctx, e, this.t); else if (e.type === 'flyer') E.drawFlyer(ctx, e, this.t); else if (e.type === 'turret') E.drawTurret(ctx, e, this.t); else if (e.type === 'heavy') E.drawHeavy(ctx, e, this.t); else E.drawDrone(ctx, e, this.t); }
      ctx.restore();
    }
    if (g.boss) {
      const b = g.boss; this.shadow(ctx, b.x, 0, b.w * 0.9, camX);
      ctx.save(); ctx.translate(b.x - camX, GY); E.drawBoss(ctx, b, this.t, g); ctx.restore();
    }

    // игрок
    this.drawPlayer(ctx, camX);

    // плиты в полёте
    for (const f of this.flights) this.drawFlight(ctx, f, camX);
    // пули
    for (const b of g.bullets) { ctx.save(); ctx.translate(-camX, GY); E.drawSlabBullet(ctx, b, this.t); ctx.restore(); }
    for (const b of g.ebullets) { ctx.save(); ctx.translate(-camX, GY); E.drawEnemyBullet(ctx, b, this.t); ctx.restore(); }
    // частицы
    this.drawParts(ctx, camX, GY);

    this.drawForeground(ctx, W, H, GY, camX);
    ctx.restore();

    // свет, виньетка, вспышки
    ctx.fillStyle = vgrad(ctx, 0, H, [[0, 'rgba(255,196,120,0.10)'], [0.55, 'rgba(255,196,120,0)'], [1, 'rgba(30,14,6,0.22)']]); ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = rgrad(ctx, W / 2, H * 0.55, Math.min(W, H) * 0.45, Math.hypot(W, H) * 0.62, [[0, 'rgba(25,12,6,0)'], [1, 'rgba(25,12,6,0.5)']]); ctx.fillRect(0, 0, W, H);
    if (this.flash.a > 0.01) { ctx.globalAlpha = Math.min(1, this.flash.a); ctx.fillStyle = this.flash.c; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }

  shadow(ctx, wx, wy, w, camX) {
    const y = this.game.surfaceBelow(wx, wy); if (y === null) return;
    const h = Math.max(0, Math.min(1, 1 - (y - wy) / -300 * 0)); const dist = Math.abs(y - wy);
    ctx.fillStyle = `rgba(20,12,6,${clamp(0.32 - dist / 600, 0.08, 0.32)})`;
    ctx.beginPath(); ctx.ellipse(wx - camX + 6, this.GY + y + 4, w * 0.5 * clamp(1 - dist / 500, 0.5, 1), 7, 0, 0, TAU); ctx.fill();
  }

  drawPlayer(ctx, camX) {
    const g = this.game, p = g.player;
    this.shadow(ctx, p.x, p.y, 70, camX);
    if (p.invuln > 0 && p.shield <= 0 && Math.floor(this.t * 14) % 2 === 0 && g.phase === 'running') return;
    ctx.save(); ctx.translate(p.x - camX, this.GY + p.y); ctx.scale(1.25, 1.25);
    const feed = this.feedT > 0 ? Math.sin((1 - this.feedT / 0.28) * Math.PI) : 0;
    drawRobot(ctx, { facing: p.facing, t: this.t, run: p.run, vx: p.vx, vy: p.vy, onGround: p.onGround, crouch: p.crouch, aim: p.aimAngle, flash: p.flash > 0 ? p.flash / 0.07 : 0, hurt: Math.max(0, p.hurt / 0.4), feed, blink: this.blink });
    if (p.shield > 0) drawShield(ctx, this.t, p.shield < 1.5 ? (Math.sin(this.t * 24) > 0 ? 1 : 0.3) : 1);
    ctx.restore();
  }

  drawFlight(ctx, f, camX) {
    const u = clamp(f.t / f.dur, 0, 1), e = u * u * (3 - 2 * u);
    const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, u * u) - Math.sin(u * Math.PI) * 46;
    ctx.save(); ctx.translate(x - camX, this.GY + y); ctx.rotate(f.rot + u * 0.7);
    const w = 66 * (0.55 + 0.45 * u), h = 11 * (0.7 + 0.3 * u);
    rr(ctx, -w / 2, -h / 2, w, h, 3); ctx.fillStyle = vgrad(ctx, -h / 2, h / 2, [[0, '#fffaf0'], [1, '#d4cab4']]); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
    glow(ctx, x - camX, this.GY + y, 40, '#ffd9a0', 0.5 * (1 - u * 0.4));
  }

  drawParts(ctx, camX, GY) {
    for (const q of this.parts) {
      const x = q.x - camX, y = GY + q.y, a = clamp(q.life / q.max, 0, 1);
      if (x < -80 || x > this.W + 80) continue;
      switch (q.type) {
        case 'spark': ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(x, y, q.size * (0.4 + a * 0.6), 0, TAU); ctx.fill(); ctx.restore(); break;
        case 'dust': ctx.save(); ctx.globalAlpha = a * 0.4; ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(x, y, q.size, 0, TAU); ctx.fill(); ctx.restore(); break;
        case 'smoke': ctx.save(); ctx.globalAlpha = a * 0.45; ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(x, y, q.size, 0, TAU); ctx.fill(); ctx.restore(); break;
        case 'ring': { const r = q.size * (1 - a) + 8; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.strokeStyle = q.color; ctx.lineWidth = 3 * a + 1; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.restore(); break; }
        case 'fire': { const r = q.size * (1 - a * 0.4); glow(ctx, x, y, r * 1.6, '#ff7a30', a); glow(ctx, x, y, r, '#ffe2a0', a); break; }
        case 'shard': ctx.save(); ctx.translate(x, y); ctx.rotate(q.rot); ctx.globalAlpha = Math.min(1, a * 2); ctx.fillStyle = q.color; ctx.beginPath(); for (let i = 0; i < q.pts; i++) { const ang = i / q.pts * TAU, rad = q.size * (0.55 + 0.45 * hash(i, q.pts)); ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad * 0.7); } ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); break;
        case 'text': ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.6); ctx.font = `800 ${q.size}px "Bahnschrift", "Segoe UI", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(30,18,8,0.75)'; ctx.strokeText(q.str, x, y); ctx.fillStyle = q.color; ctx.fillText(q.str, x, y); ctx.restore(); break;
      }
    }
  }

  drawForeground(ctx, W, H, GY, camX) {
    // тёмные листья по нижней кромке — глубина кадра
    const base = H + 6, p = 1.35;
    ctx.save();
    for (let i = 0; i < 26; i++) {
      const wx = i * 190 + hash(i, 1) * 90, sx = ((wx - camX * p) % (W + 400) + (W + 400)) % (W + 400) - 200;
      const h = 34 + hash(i, 2) * 46, w = 50 + hash(i, 3) * 60;
      ctx.fillStyle = hash(i, 4) < 0.5 ? '#1c3a22' : '#26482a';
      ctx.beginPath(); ctx.moveTo(sx, base); ctx.quadraticCurveTo(sx + w * 0.2, base - h, sx + w * 0.5, base - h * 1.05); ctx.quadraticCurveTo(sx + w * 0.9, base - h * 0.5, sx + w, base); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  dispose() { this.disposed = true; this.off?.(); this.parts.length = 0; this.flights.length = 0; }
}
