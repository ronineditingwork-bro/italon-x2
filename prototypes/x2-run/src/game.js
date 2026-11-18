// Правила игры без графики: движение, прыжок, стрельба, враги, боссы, подбор оружия, укладка плитки.
// Ось Y направлена вниз; поверхность земли — y = 0, всё, что выше, имеет отрицательный y.
import { CONFIG } from './config.js';
import { buildLevel } from './level.js';
import { createRng } from './rng.js';

const P = CONFIG.player;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FIXED = 1 / 60;

export class Game {
  constructor(seed = CONFIG.seed) {
    this.seed = seed;
    this.level = buildLevel(seed);
    this.listeners = new Set();
    this.view = { w: CONFIG.view.defaultW, h: CONFIG.view.baseH };
    this.input = { left: false, right: false, up: false, down: false, fire: false };
    this.reset();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, data = {}) { const e = { type, ...data }; for (const fn of this.listeners) fn(e); }
  setView(w, h) { this.view.w = w; this.view.h = h; }

  reset() {
    this.rng = createRng(this.seed + 5);
    this.phase = 'menu';
    this.time = 0; this.acc = 0; this.timeScale = 1; this.slow = 0;
    this.cam = { x: 0 }; this.lockX = null;
    this.zone = 0; this.nextId = 1;
    this.player = {
      x: 220, y: 0, vx: 0, vy: 0, onGround: true, onLedge: -1, facing: 1, crouch: false,
      hearts: P.hearts, invuln: 0, shield: 0, weapon: 'slab', cooldown: 0, flash: 0,
      coyote: 0, buffer: 0, jumpHeld: false, aim: { x: 1, y: 0 }, aimAngle: 0, drop: 0, safeX: 220, dead: false, hurt: 0, run: 0,
    };
    this.bullets = []; this.ebullets = []; this.enemies = []; this.items = [];
    this.spawnIdx = 0; this.droneIdx = 0;
    this.boss = null; this.bossesDefeated = 0;
    this.laidX = this.player.x - CONFIG.lay.lag;
    this.nextTileX = Math.floor(this.laidX / CONFIG.lay.tileLen) * CONFIG.lay.tileLen + CONFIG.lay.tileLen;
    this.tiles = 0; this.area = 0; this.defects = 0; this.boxes = 0; this.shots = 0; this.hits = 0;
    this.won = false;
  }

  start() {
    this.reset();
    this.phase = 'running';
    this.emit('start');
    this.emit('zone', { zone: 0 });
  }
  pause() { if (this.phase === 'running') { this.phase = 'paused'; this.emit('pause'); } }
  resume() { if (this.phase === 'paused') { this.phase = 'running'; this.emit('resume'); } }
  togglePause() { this.phase === 'running' ? this.pause() : this.resume(); }

  // ---------- ввод ----------
  pressJump() { const p = this.player; p.buffer = P.buffer; p.jumpHeld = true; }
  releaseJump() { const p = this.player; p.jumpHeld = false; if (p.vy < 0 && !p.onGround) p.vy *= P.jumpCut; }

  // ---------- мир ----------
  groundAt(x) { for (const g of this.level.gaps) if (x > g.x0 && x < g.x1) return false; return true; }
  /** Ближайшая поверхность, на которую можно приземлиться, пока объект падал с prevY до y. */
  landing(x, prevY, y, ignoreLedges = false) {
    let best = null;
    if (this.groundAt(x) && prevY <= 1 && y >= 0) best = { y: 0, ledge: -1 };
    if (!ignoreLedges) this.level.ledges.forEach((l, i) => {
      if (x < l.x0 - 6 || x > l.x1 + 6) return;
      const sy = -l.h;
      if (prevY <= sy + 1 && y >= sy && (!best || sy < best.y)) best = { y: sy, ledge: i };
    });
    return best;
  }
  /** Что под ногами прямо сейчас (для схода с уступа). */
  supportAt(x, y, ignoreLedges = false) {
    if (y >= -1 && y <= 1 && this.groundAt(x)) return { y: 0, ledge: -1 };
    if (!ignoreLedges) for (let i = 0; i < this.level.ledges.length; i++) {
      const l = this.level.ledges[i];
      if (x >= l.x0 - 6 && x <= l.x1 + 6 && Math.abs(y + l.h) <= 1) return { y: -l.h, ledge: i };
    }
    return null;
  }

  /** Высота ближайшей поверхности под точкой (для теней); null — под ногами пропасть. */
  surfaceBelow(x, y) {
    let best = null;
    if (this.groundAt(x) && y <= 1) best = 0;
    for (const l of this.level.ledges) if (x >= l.x0 - 6 && x <= l.x1 + 6 && y <= -l.h + 1 && (best === null || -l.h > best)) best = -l.h;
    return best;
  }

  weapon() { return CONFIG.weapons[this.player.weapon]; }

  playerRect() {
    const p = this.player, h = p.crouch ? P.crouchH : P.h;
    return { x: p.x - P.w / 2 + 3, y: p.y - h, w: P.w - 6, h };
  }

  // ---------- шаг ----------
  /** dt — реальные секунды; внутри — фиксированный шаг 1/60, чтобы поведение не зависело от частоты кадров. */
  update(dt) {
    if (this.phase !== 'running' && this.phase !== 'dying') return;
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= FIXED) { this.acc -= FIXED; this.step(FIXED); if (this.phase !== 'running') break; }
  }

  step(dt) {
    // замедление при победе над боссом
    if (this.slow > 0) { this.slow -= dt; this.timeScale = 0.35; } else this.timeScale = 1;
    dt *= this.timeScale;
    this.time += dt;
    this.stepPlayer(dt);
    this.stepCamera();
    this.stepSpawns();
    this.stepEnemies(dt);
    this.stepBoss(dt);
    this.stepBullets(dt);
    this.stepItems(dt);
    this.stepLaying();
    this.stepZone();
    if (this.player.invuln > 0) this.player.invuln -= dt;
    if (this.player.shield > 0) this.player.shield -= dt;
    if (this.player.flash > 0) this.player.flash -= dt;
    if (this.player.hurt > 0) this.player.hurt -= dt;
  }

  stepPlayer(dt) {
    const p = this.player, inp = this.input;
    const dx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    // прицел: 8 направлений
    p.crouch = p.onGround && inp.down && dx === 0 && !inp.up;
    if (dx !== 0 && !p.crouch) p.facing = dx;
    let ax = dx, ay = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
    if (p.crouch) { ax = p.facing; ay = 0; }
    else if (dx === 0 && ay === 0) ax = p.facing;
    else if (dx === 0 && ay > 0 && p.onGround) { ax = p.facing; ay = 0; }
    if (ax === 0 && ay === 0) ax = p.facing;
    const len = Math.hypot(ax, ay) || 1;
    p.aim.x = ax / len; p.aim.y = ay / len; p.aimAngle = Math.atan2(p.aim.y, p.aim.x);

    // горизонталь
    const target = p.crouch ? 0 : dx * P.runSpeed;
    const rate = (dx !== 0 ? P.accel : P.friction) * (p.onGround ? 1 : P.airControl);
    if (p.vx < target) p.vx = Math.min(target, p.vx + rate * dt); else if (p.vx > target) p.vx = Math.max(target, p.vx - rate * dt);
    p.x += p.vx * dt;
    const minX = this.cam.x + P.edgePad;
    if (p.x < minX) { p.x = minX; if (p.vx < 0) p.vx = 0; }
    if (this.lockX !== null) { const maxX = this.cam.x + this.view.w - P.edgePad; if (p.x > maxX) { p.x = maxX; if (p.vx > 0) p.vx = 0; } }
    p.run += Math.abs(p.vx) * dt * 0.045;

    // прыжок: запас по времени и «койот»
    if (p.buffer > 0) p.buffer -= dt;
    if (p.coyote > 0) p.coyote -= dt;
    if (p.drop > 0) p.drop -= dt;
    if (p.buffer > 0 && (p.onGround || p.coyote > 0)) {
      if (inp.down && p.onGround && p.onLedge >= 0) { p.drop = 0.25; p.onGround = false; p.onLedge = -1; p.y += 2; p.coyote = 0; p.buffer = 0; }
      else { p.vy = -P.jumpV; p.onGround = false; p.onLedge = -1; p.coyote = 0; p.buffer = 0; this.emit('jump'); }
    }

    // вертикаль
    if (!p.onGround) {
      const prev = p.y;
      p.vy = Math.min(P.maxFall, p.vy + P.gravity * (p.vy > 0 ? P.fallMul : 1) * dt);
      p.y += p.vy * dt;
      if (p.vy >= 0) {
        const l = this.landing(p.x, prev, p.y, p.drop > 0);
        if (l) { p.y = l.y; p.vy = 0; p.onGround = true; p.onLedge = l.ledge; this.emit('land'); }
      }
    } else {
      const s = this.supportAt(p.x, p.y);
      if (!s) { p.onGround = false; p.coyote = P.coyote; p.onLedge = -1; }
      else p.onLedge = s.ledge;
    }
    if (p.onGround && p.onLedge < 0) this.markSafe();
    if (p.y > 260) this.fall();

    // стрельба
    if (p.cooldown > 0) p.cooldown -= dt;
    if (inp.fire && p.cooldown <= 0) this.shoot();
  }

  markSafe() {
    const p = this.player;
    for (const g of this.level.gaps) if (p.x > g.x0 - 90 && p.x < g.x1 + 90) return;
    p.safeX = p.x;
  }

  shoot() {
    const p = this.player, w = this.weapon();
    if (this.bullets.length >= CONFIG.maxPlayerBullets) return;
    const hy = p.y - (p.crouch ? 54 : 86);
    const mx = p.x + p.aim.x * 50, my = hy + p.aim.y * 50;
    for (let i = 0; i < w.count; i++) {
      const a = p.aimAngle + (w.count > 1 ? (i - (w.count - 1) / 2) * w.spread : (this.rng.next() - 0.5) * w.spread);
      this.bullets.push({ id: this.nextId++, x: mx, y: my, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, dmg: w.dmg, size: w.size, pierce: w.pierce, hit: w.pierce ? new Set() : null, life: CONFIG.bulletRange / w.speed, a });
    }
    p.cooldown = w.interval; p.flash = 0.07; this.shots++;
    this.emit('shoot', { weapon: w.id, x: mx, y: my, a: p.aimAngle });
  }

  stepCamera() {
    const p = this.player, v = this.view;
    if (this.lockX !== null) { this.cam.x = this.lockX; return; }
    const want = p.x - v.w * P.camLead;
    if (want > this.cam.x) this.cam.x = want;
  }

  // ---------- появление врагов ----------
  stepSpawns() {
    const right = this.cam.x + this.view.w;
    const sp = this.level.spawns;
    while (this.spawnIdx < sp.length) {
      const s = sp[this.spawnIdx];
      const at = s.trigger ?? s.x - 120;
      if (this.lockX !== null && at > this.lockX - 1) break;
      if (right < at) break;
      this.spawnIdx++;
      this.spawn(s);
    }
    const dr = this.level.drones;
    while (this.droneIdx < dr.length && right >= dr[this.droneIdx].trigger && this.lockX === null) {
      const d = dr[this.droneIdx++];
      this.enemies.push(this.makeEnemy('drone', { x: right + 70, y: d.y, item: d.item }));
    }
  }

  makeEnemy(type, o = {}) {
    const c = CONFIG.enemies[type];
    const e = { id: this.nextId++, type, hp: c.hp, maxHp: c.hp, x: o.x ?? 0, y: o.y ?? 0, vx: 0, vy: 0, t: 0, flash: 0, air: type === 'flyer' || type === 'drone', dir: -1, state: 'idle', ...o };
    e.w = c.w; e.h = c.h;
    if (type === 'runner') { e.speed = this.rng.range(c.speed[0], c.speed[1]); e.onGround = true; }
    if (type === 'flyer') { e.baseY = e.y; e.phase = this.rng.range(0, 6); e.shootIn = this.rng.range(c.shootEvery[0], c.shootEvery[1]); e.vx = -c.speed; }
    if (type === 'drone') { e.baseY = e.y; e.phase = this.rng.range(0, 6); e.vx = -c.speed; }
    if (type === 'turret') { e.k = 0; e.state = 'closed'; e.timer = this.rng.range(0.4, c.closed); e.burstLeft = 0; e.gap = 0; e.ang = Math.PI; }
    if (type === 'heavy') { e.state = 'walk'; e.timer = 0; e.onGround = true; e.dir = -1; }
    return e;
  }

  spawn(s) {
    const right = this.cam.x + this.view.w;
    if (s.type === 'runner') this.enemies.push(this.makeEnemy('runner', { x: right + 60, y: 0 }));
    else if (s.type === 'flyer') this.enemies.push(this.makeEnemy('flyer', { x: right + 70, y: s.y ?? -280 }));
    else if (s.type === 'heavy') this.enemies.push(this.makeEnemy('heavy', { x: right + 90, y: 0 }));
    else if (s.type === 'turret') {
      const y = s.ledge !== undefined ? -this.level.ledges[s.ledge].h : 0;
      this.enemies.push(this.makeEnemy('turret', { x: s.x, y }));
    }
  }

  // ---------- враги ----------
  stepEnemies(dt) {
    const p = this.player, cfg = CONFIG.enemies;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.t += dt; if (e.flash > 0) e.flash -= dt;
      if (e.type === 'runner') {
        e.dir = Math.sign(p.x - e.x) || -1;
        e.vx = e.dir * e.speed;
        e.x += e.vx * dt; this.gravityStep(e, dt, 'ground');
      } else if (e.type === 'flyer') {
        e.x += e.vx * dt; e.y = e.baseY + Math.sin(e.t * 2.1 + e.phase) * cfg.flyer.bob;
        e.shootIn -= dt;
        if (e.shootIn <= 0 && e.x < this.cam.x + this.view.w - 40 && e.x > p.x - 60) { e.shootIn = this.rng.range(...cfg.flyer.shootEvery); this.aimShot(e.x, e.y + 10, 1); }
      } else if (e.type === 'drone') {
        e.x += e.vx * dt; e.y = e.baseY + Math.sin(e.t * 2.4 + e.phase) * 34;
      } else if (e.type === 'turret') this.turretStep(e, dt);
      else if (e.type === 'heavy') this.heavyStep(e, dt);

      // столкновение с игроком
      if (e.type !== 'drone' && this.overlaps(this.playerRect(), this.enemyRect(e))) this.hurtPlayer(e.x, e.type);
      if (e.x < this.cam.x - 220 || e.y > 300 || (e.air && e.x < this.cam.x - 160)) {
        this.enemies.splice(i, 1);
      }
    }
  }

  gravityStep(e, dt, mode) {
    e.vy += 2200 * dt;
    const prev = e.y; e.y += e.vy * dt;
    if (e.vy >= 0) {
      const l = this.landing(e.x, prev, e.y, false);
      if (l) { e.y = l.y; e.vy = 0; e.onGround = true; }
      else if (e.onGround && !this.supportAt(e.x, e.y)) e.onGround = false;
    }
  }

  turretStep(e, dt) {
    const p = this.player, c = CONFIG.enemies.turret;
    e.timer -= dt; e.k += ((e.state === 'open' ? 1 : 0) - e.k) * Math.min(1, dt * 9);
    const inRange = Math.abs(p.x - e.x) < c.range && e.x < this.cam.x + this.view.w + 20;
    e.ang = Math.atan2((p.y - 72) - (e.y - 44), p.x - e.x);
    if (e.state === 'closed') { if (e.timer <= 0 && inRange) { e.state = 'open'; e.timer = c.open; e.burstLeft = c.burst; e.gap = 0.5; } else if (e.timer <= 0) e.timer = 0.3; }
    else if (e.state === 'open') {
      e.gap -= dt;
      if (e.burstLeft > 0 && e.gap <= 0) { this.aimShot(e.x, e.y - 44, 1.0, e.ang); e.burstLeft--; e.gap = c.burstGap; }
      if (e.timer <= 0) { e.state = 'closed'; e.timer = c.closed; }
    }
  }

  heavyStep(e, dt) {
    const p = this.player, c = CONFIG.enemies.heavy;
    e.timer -= dt;
    if (e.state === 'walk') { e.dir = Math.sign(p.x - e.x) || -1; e.vx = e.dir * c.speed; e.x += e.vx * dt; if (Math.abs(p.x - e.x) < 420) { e.state = 'windup'; e.timer = c.windup; e.vx = 0; } }
    else if (e.state === 'windup') { e.dir = Math.sign(p.x - e.x) || -1; if (e.timer <= 0) { e.state = 'charge'; e.timer = c.chargeTime; this.emit('charge', { x: e.x }); } }
    else if (e.state === 'charge') { e.vx = e.dir * c.charge; e.x += e.vx * dt; if (e.timer <= 0) { e.state = 'rest'; e.timer = c.rest; } }
    else if (e.state === 'rest') { e.vx = 0; if (e.timer <= 0) e.state = 'walk'; }
    this.gravityStep(e, dt, 'ground');
  }

  aimShot(x, y, speedMul = 1, ang = null) {
    const p = this.player;
    const a = ang ?? Math.atan2((p.y - (p.crouch ? 42 : 72)) - y, p.x - x);
    const sp = CONFIG.enemyBulletSpeed * speedMul;
    this.ebullets.push({ id: this.nextId++, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 9, life: 5, grav: 0, kind: 'pebble' });
    this.emit('enemyShot', { x, y });
  }

  enemyRect(e) { return e.air ? { x: e.x - e.w / 2 + 4, y: e.y - e.h / 2 + 4, w: e.w - 8, h: e.h - 8 } : { x: e.x - e.w / 2 + 4, y: e.y - e.h + 3, w: e.w - 8, h: e.h - 3 }; }
  overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

  // ---------- босс ----------
  stepBoss(dt) {
    const z = this.level.zones[this.zone], p = this.player;
    if (!this.boss && this.lockX === null && this.bossesDefeated === this.zone && p.x > z.arenaX && this.zone < this.level.zones.length) {
      this.lockX = this.cam.x; this.arenaFrom = this.cam.x;
      this.boss = this.makeBoss(this.zone);
      this.emit('bossStart', { zone: this.zone });
    }
    const b = this.boss; if (!b) return;
    b.t += dt; if (b.flash > 0) b.flash -= dt;
    const right = this.cam.x + this.view.w;
    if (b.state === 'enter') {
      b.x -= 170 * dt;
      if (b.x <= right - 300) { b.x = right - 300; b.state = 'fight'; b.cycle = 1.2; b.tx = b.x; }
    } else if (b.state === 'fight') this.bossAI(b, dt);
    else if (b.state === 'dying') {
      b.dyingT -= dt;
      b.boomT -= dt;
      if (b.boomT <= 0) { b.boomT = 0.12; this.emit('explosion', { x: b.x + (this.rng.next() - 0.5) * b.w, y: b.y - this.rng.next() * b.h, big: false }); }
      if (b.dyingT <= 0) this.finishBoss();
      return;
    }
    // касание босса
    if (b.state !== 'enter' && this.overlaps(this.playerRect(), this.bossRect(b))) this.hurtPlayer(b.x, 'boss');
  }

  makeBoss(zone) {
    const c = CONFIG.boss, right = this.cam.x + this.view.w;
    return { id: this.nextId++, kind: zone, hp: c.hp[zone], maxHp: c.hp[zone], x: right + 300, y: 0, w: c.w, h: c.h, vx: 0, t: 0, flash: 0, state: 'enter', cycle: 2, step: 0, tx: 0, atk: null, atkT: 0, dyingT: 0, boomT: 0 };
  }
  bossRect(b) { return { x: b.x - b.w / 2, y: b.y - b.h, w: b.w, h: b.h }; }

  bossAI(b, dt) {
    const p = this.player, right = this.cam.x + this.view.w, left = this.cam.x;
    b.cycle -= dt;
    // постоянное движение по типу
    if (b.kind === 0) { b.x = b.tx + Math.sin(b.t * 0.8) * 90; }
    else if (b.kind === 1) { b.x = b.tx + Math.sin(b.t * 0.6) * 150; }
    else if (b.kind === 2) {
      if (b.atk === 'charge') {
        b.atkT -= dt;
        if (b.atkT > 0.5) { b.x -= 560 * dt; if (b.x < left + b.w / 2 + 40) { b.x = left + b.w / 2 + 40; b.atkT = 0.5; this.emit('shake', { power: 8 }); } }
        else if (b.atkT > 0) { /* пауза у стены */ }
        else { b.atk = 'return'; }
      } else if (b.atk === 'return') { b.x += 260 * dt; if (b.x >= right - 300) { b.x = right - 300; b.atk = null; b.cycle = 1.4; } }
    } else if (b.kind === 3) { b.x = b.tx + Math.sin(b.t * 0.5) * 60; }

    if (b.cycle <= 0 && b.atk !== 'charge' && b.atk !== 'return') this.bossAttack(b);
  }

  bossAttack(b) {
    const p = this.player, ex = b.x - b.w * 0.35, ey = b.y - b.h * 0.75;
    b.step++;
    if (b.kind === 0) {       // асфальтоукладчик: веер из трубы и «щебень-бегуны»
      const a0 = Math.atan2((p.y - 55) - ey, p.x - ex);
      for (const d of [-0.28, 0, 0.28]) this.aimShot(ex, ey, 1.0, a0 + d);
      if (b.step % 3 === 0) { this.enemies.push(this.makeEnemy('runner', { x: b.x - b.w / 2, y: 0 })); }
      b.cycle = 2.1;
    } else if (b.kind === 1) { // бетономешалка: навесные комки бетона
      const n = 3;
      for (let i = 0; i < n; i++) {
        const tx = p.x + (i - 1) * 140, t = 0.95 + i * 0.12, dx = tx - ex, g = 1500;
        const vx = dx / t, vy = (0 - ey) / t - 0.5 * g * t;
        this.ebullets.push({ id: this.nextId++, x: ex, y: ey, vx, vy, r: 14, life: 3, grav: g, kind: 'blob' });
      }
      this.emit('enemyShot', { x: ex, y: ey });
      b.cycle = 2.4;
    } else if (b.kind === 2) { // каток: таран и дождь щебня
      if (b.step % 2 === 0) { b.atk = 'charge'; b.atkT = 3.2; this.emit('charge', { x: b.x }); b.cycle = 99; }
      else { for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + (i - 1.5) * 0.35; this.ebullets.push({ id: this.nextId++, x: ex, y: ey, vx: Math.cos(a) * 300 - 160, vy: Math.sin(a) * 620, r: 11, life: 4, grav: 1300, kind: 'pebble' }); } b.cycle = 2.0; }
    } else {                   // экскаватор: серия выстрелов и обмах ковша по земле
      if (b.step % 3 === 0) { b.atk = 'swing'; this.ebullets.push({ id: this.nextId++, x: b.x - b.w / 2, y: -26, vx: -430, vy: 0, r: 26, life: 4, grav: 0, kind: 'wave' }); this.emit('enemyShot', { x: b.x, y: -20 }); b.cycle = 2.0; }
      else { const a0 = Math.atan2((p.y - 55) - ey, p.x - ex); for (let i = -2; i <= 2; i++) this.aimShot(ex, ey, 1.05, a0 + i * 0.13); if (b.step % 3 === 1) this.enemies.push(this.makeEnemy("flyer", { x: this.cam.x + this.view.w + 60, y: -260 })); b.cycle = 1.9; }
    }
  }

  damageBoss(b, dmg) {
    if (b.state !== 'fight') return;
    b.hp -= dmg; b.flash = 0.08; this.hits++;
    if (b.hp <= 0) {
      b.state = 'dying'; b.dyingT = 2.0; b.boomT = 0; this.slow = 1.6; this.ebullets.length = 0;
      this.enemies = this.enemies.filter(e => e.type === 'drone');
      this.emit('explosion', { x: b.x, y: b.y - b.h / 2, big: true });
    }
  }

  finishBoss() {
    const b = this.boss, z = this.zone;
    this.emit('explosion', { x: b.x, y: b.y - b.h / 2, big: true });
    this.boss = null; this.bossesDefeated++;
    this.area += CONFIG.boss.bonus; this.defects++;
    this.emit('bossDefeated', { zone: z });
    if (z >= this.level.zones.length - 1) { this.finish(true); return; }
    this.lockX = null;
    this.items.push(this.makeItem('heart', this.cam.x + this.view.w * 0.5, -260));
  }

  // ---------- пули ----------
  stepBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let dead = b.life <= 0 || b.y < -900 || b.y > 200 || b.x < this.cam.x - 80 || b.x > this.cam.x + this.view.w + 80;
      if (!dead) dead = this.bulletHit(b);
      if (dead) this.bullets.splice(i, 1);
    }
    for (let i = this.ebullets.length - 1; i >= 0; i--) {
      const b = this.ebullets[i];
      if (b.grav) b.vy += b.grav * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let dead = b.life <= 0 || b.x < this.cam.x - 120 || b.x > this.cam.x + this.view.w + 160 || b.y > 24 && b.kind !== 'wave';
      if (!dead) {
        const r = this.playerRect(), cx = clamp(b.x, r.x + 3, r.x + r.w - 3), cy = clamp(b.y, r.y, r.y + r.h);
        if ((b.x - cx) ** 2 + (b.y - cy) ** 2 < (b.r) ** 2) { this.hurtPlayer(b.x - b.vx * 0.1, 'shot:' + b.kind); dead = true; }
      }
      if (dead) { if (b.y > 20 && b.kind === 'blob') this.emit('splat', { x: b.x, y: 0 }); this.ebullets.splice(i, 1); }
    }
  }

  bulletHit(b) {
    const rad = 10 * b.size;
    // враги
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (b.hit && b.hit.has(e.id)) continue;
      const r = this.enemyRect(e);
      if (b.x > r.x - rad && b.x < r.x + r.w + rad && b.y > r.y - rad && b.y < r.y + r.h + rad) {
        if (e.type === 'turret' && e.state === 'closed') { this.emit('ping', { x: b.x, y: b.y }); return true; }
        this.damageEnemy(e, b.dmg, b);
        if (b.hit) { b.hit.add(e.id); continue; }
        return true;
      }
    }
    const bs = this.boss;
    if (bs && bs.state === 'fight') {
      const r = this.bossRect(bs);
      if (b.x > r.x && b.x < r.x + r.w && b.y > r.y && b.y < r.y + r.h && !(b.hit && b.hit.has(bs.id))) {
        this.damageBoss(bs, b.dmg); this.emit('bossHit', { x: b.x, y: b.y });
        if (b.hit) { b.hit.add(bs.id); return false; }
        return true;
      }
    }
    return false;
  }

  damageEnemy(e, dmg, b) {
    e.hp -= dmg; e.flash = 0.09; this.hits++;
    this.emit('enemyHit', { x: b?.x ?? e.x, y: b?.y ?? e.y, kind: e.type });
    if (e.hp > 0) return;
    const i = this.enemies.indexOf(e); if (i >= 0) this.enemies.splice(i, 1);
    this.defects++; this.area += CONFIG.enemies[e.type].bonus;
    this.emit('kill', { kind: e.type, x: e.x, y: e.air ? e.y : e.y - e.h / 2 });
    if (e.type === 'drone') this.items.push(this.makeItem(e.item, e.x, e.y));
  }

  // ---------- предметы ----------
  makeItem(kind, x, y) { return { id: this.nextId++, kind, x, y, vy: -120, t: 0, life: 16 }; }
  stepItems(dt) {
    const pr = this.playerRect();
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt; it.life -= dt;
      if (it.y < 0 || it.vy < 0) { const prev = it.y; it.vy += 900 * dt; it.y += it.vy * dt; if (it.vy >= 0) { const l = this.landing(it.x, prev - 30, it.y + 28, false); if (l && it.y >= l.y - 28) { it.y = l.y - 28; it.vy = 0; } } }
      const near = Math.abs(it.x - (pr.x + pr.w / 2)) < 34 && it.y > pr.y - 24 && it.y < pr.y + pr.h + 30;
      if (near) { this.items.splice(i, 1); this.pickup(it); continue; }
      if (it.life <= 0 || it.x < this.cam.x - 200) this.items.splice(i, 1);
    }
  }
  pickup(it) {
    const p = this.player; this.boxes++;
    if (it.kind === 'heart') p.hearts = Math.min(P.maxHearts, p.hearts + 1);
    else if (it.kind === 'shield') p.shield = P.shield;
    else p.weapon = it.kind;
    this.emit('pickup', { kind: it.kind, x: it.x, y: it.y });
  }

  // ---------- урон и гибель ----------
  hurtPlayer(fromX, src = '') {
    const p = this.player;
    if (p.invuln > 0 || p.shield > 0 || this.phase !== 'running') return;
    p.hearts--; p.invuln = P.invuln; p.hurt = 0.4; p.weapon = 'slab';
    p.vy = -380; p.vx = (p.x >= fromX ? 1 : -1) * 240; p.onGround = false; p.onLedge = -1; p.coyote = 0;
    this.emit('hit', { hearts: p.hearts, src });
    if (p.hearts <= 0) this.finish(false);
  }
  fall() {
    const p = this.player;
    p.hearts--; this.emit('fall', { hearts: p.hearts });
    if (p.hearts <= 0) { this.finish(false); return; }
    p.x = Math.max(this.cam.x + 90, Math.min(p.safeX, this.cam.x + this.view.w - 90)); p.y = -260; p.vx = 0; p.vy = 0; p.onGround = false; p.onLedge = -1;
    if (!this.groundAt(p.x)) { /* безопасная точка всегда до ямы */ }
    p.invuln = P.respawnInvuln; p.weapon = 'slab';
    this.emit('respawn', {});
  }

  // ---------- укладка и зоны ----------
  stepLaying() {
    const p = this.player, tl = CONFIG.lay.tileLen;
    this.laidX = Math.max(this.laidX, p.x - CONFIG.lay.lag);
    while (this.nextTileX <= this.laidX) {
      this.emit('lay', { x: this.nextTileX, idx: this.tiles });
      this.tiles++; this.area += CONFIG.lay.rowM2; this.nextTileX += tl;
    }
  }
  stepZone() {
    const z = clamp(Math.floor(this.player.x / CONFIG.zoneLen), 0, this.level.zones.length - 1);
    if (z > this.zone && this.bossesDefeated >= z) { this.zone = z; this.player.hearts = Math.min(P.maxHearts, this.player.hearts + 1); this.emit('zone', { zone: z }); }
  }

  finish(won) {
    this.won = won; this.phase = won ? 'won' : 'over';
    this.emit(won ? 'win' : 'over', this.summary());
  }

  summary() {
    return { area: this.area, tiles: this.tiles, defects: this.defects, boxes: this.boxes, time: this.time, zone: this.zone, hearts: this.player.hearts, won: this.won, accuracy: this.shots ? this.hits / this.shots : 0 };
  }
}
