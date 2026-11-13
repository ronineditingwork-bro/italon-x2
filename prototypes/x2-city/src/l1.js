// Уровень 1 «Побег»: вид сбоку в 3D. Правила — escape.js; здесь только картинка.
import { THREE, MAT, add, B, C, S, RB, rnd, glow, building, makeX2, makeHelper, makeBrak, makePaver, makeRoller, car, tree, barrier, rain, sky, cage } from './kit.js';
import { CONFIG } from '../../x2-run/src/config.js';
import { EscapeGame } from './escape.js';
import { Fx } from './fx.js';

const U = 1 / 48, DEPTH = 5.2, ROWS = 46;
const ITEM_COLOR = { fan: '#ffb14a', rapid: '#7fe9ff', heavy: '#c9a2ff', shield: '#7bf29a', heart: '#ff5a6a' };

export class Level1 {
  constructor(ctx) {
    this.ctx = ctx; this.name = 'Побег'; this.hint = 'Асфальтоукладчик проснулся. Выведите бригаду с парковки.';
    const g = this.game = ctx.game || new EscapeGame(), look = ctx.look || {}, sc = this.scene = new THREE.Scene(), tm = this.tm = ctx.tm, hi = ctx.quality === 'high';
    this.cam = new THREE.PerspectiveCamera(35, 16 / 9, 0.5, 700); this.t = 0; this.blink = 0;
    this.fx = new Fx(sc, hi ? 360 : 180, ctx.reduced);
    sky(sc, look.sky || [[0, '#02040c'], [0.36, '#0a1530'], [0.47, '#2a2c5c'], [0.5, '#6a4a62'], [0.52, '#090b16'], [1, '#04050a']]); sc.fog = new THREE.FogExp2(look.fog || '#111733', 0.017);
    sc.add(new THREE.HemisphereLight('#6a7cc0', '#141624', 0.42));
    const moon = this.moon = new THREE.DirectionalLight(look.moon || '#a9c2ff', 0.9); if (hi) { moon.castShadow = true; moon.shadow.mapSize.set(1024, 1024); Object.assign(moon.shadow.camera, { left: -16, right: 16, top: 12, bottom: -8, near: 1, far: 60 }); moon.shadow.bias = -0.002; } sc.add(moon, moon.target);
    const fill = new THREE.DirectionalLight('#3d4f8c', 0.25); fill.position.set(6, 6, 16); sc.add(fill);
    this.warm = new THREE.PointLight('#ffb878', 0.9, 16, 2); sc.add(this.warm);            // тёплый свет над уложенной плиткой
    this.lamp = new THREE.SpotLight('#cfe4ff', 1.1, 22, 0.5, 0.6); sc.add(this.lamp, this.lamp.target); // фонарь робота
    this.rainG = new THREE.Group(); if (look.rain !== false) rain(this.rainG, 0, 0, -6, hi ? 900 : 350, 44); this.rainG.scale.z = 0.45; sc.add(this.rainG);

    // ---- земля с ямами, уступы ----
    const [from, end] = ctx.range || [0, g.endX], gaps = [...g.level.gaps].filter(q => q.x0 < end + 600).sort((a, b) => a.x0 - b.x0); let x0 = from - 2400;
    const slab = (a, b) => { const w = (b - a) * U; if (w > 0.01) { const m = add(sc, B(w, 3, 170), MAT.asphalt, (a + b) / 2 * U, -1.5, 45); m.castShadow = false; } };
    for (const q of gaps) { slab(x0, q.x0); add(sc, B((q.x1 - q.x0) * U, 0.5, 170), MAT.rubber, (q.x0 + q.x1) / 2 * U, -3.2, 45).castShadow = false; for (const ex of [q.x0 - 14, q.x1 + 14]) { add(sc, C(0.05, 0.05, 1, 6), MAT.steel, ex * U, 0.5, 2.3); add(sc, B(0.14, 0.14, 0.14), MAT.orange, ex * U, 1.05, 2.3); } x0 = q.x1; }
    slab(x0, end + 3000);
    for (const l of g.level.ledges) { if (l.x0 > end) continue; const w = (l.x1 - l.x0) * U, h = l.h * U, cx = (l.x0 + l.x1) / 2 * U; add(sc, B(w, h, 2.6), l.kind === 'crate' ? MAT.wood : MAT.concrete, cx, h / 2, 0); add(sc, B(w + 0.08, 0.1, 2.7), l.kind === 'crate' ? MAT.kraft : MAT.steel, cx, h, 0); add(sc, B(w + 0.02, 0.22, 2.62), MAT.orange, cx, h * 0.55, 0); }
    // ---- город ----
    const L = (end + 1600) * U; this.lamps = [];
    for (let i = 0, x = from * U - 30; x < L; i++, x += 9.5) { this.lit = this.lit || []; const b1 = building(sc, 8, 9 + rnd(i, 7) * 14, 8, x, -15, 0, '#1a2140'); b1.castShadow = false; if (hi || i % 2) building(sc, 9, 20 + rnd(i, 8) * 22, 9, x + 4, -30, 1, '#111836').castShadow = false; this.lit.push({ x: x * 48, m: b1.material }); }
    for (let i = 0, x = from * U - 22; x < L; i++, x += 12) { const gp = new THREE.Group(); gp.position.set(x, 0, -4.4); sc.add(gp); add(gp, C(0.09, 0.12, 5.4, 8), MAT.steel, 0, 2.7, 0); add(gp, B(1.4, 0.09, 0.09), MAT.steel, 0.65, 5.4, 0);
      const bulb = add(gp, RB(0.7, 0.14, 0.3, 0.05), MAT.dark, 1.2, 5.32, 0), gl = glow(gp, '#ffb060', 1.8, 1.2, 5.2, 0, 2.4); gl.visible = false; this.lamps.push({ x: (x + 1.2) * 48, bulb, gl, on: false });
      if (rnd(i, 21) < 0.45) car(sc, x + 5, -7 - rnd(i, 22), (rnd(i, 23) - 0.5) * 0.4, rnd(i, 24) < 0.5 ? '#232a44' : '#2a2032'); else if (rnd(i, 25) < 0.5) tree(sc, x + 6, -8.5, false);
      if (rnd(i, 26) < 0.18) barrier(sc, x + 3, 7 + rnd(i, 27), (rnd(i, 28) - 0.5) * 0.4); }
    // финиш: ворота, в которые врежется укладчик
    if (!ctx.range) { const ex = end * U + 3; for (const z of [-3.6, 3.6]) add(sc, B(1.4, 7, 1.4), MAT.concrete, ex, 3.5, z); add(sc, B(1.6, 1.2, 8.6), MAT.steel, ex, 7.4, 0); add(sc, B(0.2, 0.8, 5), MAT.warm, ex - 0.85, 7.4, 0); glow(sc, '#ffc988', 9, ex - 1.5, 7.4, 0, 1.5); }
    // ---- действующие лица ----
    this.cages = (g.cages || []).map(c => cage(sc, tm, c.x * U, -0.9));
    if (g.chaser) { this.paver = makePaver(); sc.add(this.paver); }
    this.robot = makeX2(tm); this.robot.scale.setScalar(1.08); sc.add(this.robot);
    this.helpers = []; this.trail = { x: new Float32Array(512), y: new Float32Array(512), i: 0 };
    this.views = new Map(); this.pools = {};
    this.shots = Array.from({ length: CONFIG.maxPlayerBullets }, () => { const gp = new THREE.Group(); add(gp, B(0.34, 0.07, 0.34), tm[0]).castShadow = false; add(gp, B(0.9, 0.035, 0.1), MAT.warm, -0.6, 0, 0).castShadow = false; glow(gp, '#ffd080', 0.8, 0, 0, 0, 2.2); gp.visible = false; sc.add(gp); return gp; });
    this.eshots = Array.from({ length: 24 }, () => { const gp = new THREE.Group(); add(gp, S(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff6a20' })).castShadow = false; glow(gp, '#ff5a20', 1.7, 0, 0, 0, 2); gp.visible = false; sc.add(gp); return gp; });
    this.items = Array.from({ length: 6 }, () => { const gp = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff', emissiveIntensity: 0.6, roughness: 0.4 }); add(gp, RB(0.6, 0.6, 0.6, 0.12), m); gp.userData.m = m; gp.userData.gl = glow(gp, '#fff', 2, 0, 0, 0, 1.6); gp.visible = false; sc.add(gp); return gp; });
    this.flash = glow(sc, '#ffe9c0', 1.8, 0, 0, 0, 2.4); this.flash.visible = false;
    // ---- ряды плитки: кольцо из готовых плит ----
    const rowMat = tm.map(m => { const t = m.map.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3); t.needsUpdate = true; const r = m.clone(); r.map = t; r.emissiveMap = t; return r; });
    this.rows = Array.from({ length: ROWS }, (_, i) => { const m = add(sc, B(2 - 0.03, 0.1, DEPTH), rowMat[i % rowMat.length], -999, 0.05, 0); m.castShadow = false; m.userData.t = 1; return m; }); this.ri = 0;
    this.off = g.on(e => this.onEvent(e));
    this.reset();
  }

  reset() { const g = this.game; for (const h of this.helpers) h.visible = false; this.helperN = 0; this.rows.forEach(r => { r.position.x = -999; }); for (let x = g.nextTileX - 1152; x < g.nextTileX; x += 96) this.layRow(x, true);
    this.cages.forEach(o => { o.visible = true; o.userData.helper.visible = true; }); this.lamps.forEach(l => { l.on = false; l.bulb.material = MAT.dark; l.gl.visible = false; }); this.lit.forEach(b => { b.on = false; b.m.emissiveIntensity = 0.9; }); this.trail.x.fill(g.player.x); this.trail.y.fill(0); this.crashed = false; }
  start() { this.game.start(); this.reset(); }
  get state() { const p = this.game.phase; return p === 'won' ? 'won' : p === 'over' ? 'lost' : 'running'; }
  hud() { const g = this.game, p = g.player; return { hearts: p.hearts, max: CONFIG.player.maxHearts, helpers: g.helpers, total: g.total, area: g.area, weapon: g.weapon().name, shield: p.shield, progress: Math.min(1, p.x / g.endX), midLabel: 'До выезда' }; }
  stats() { return this.game.summary(); }

  setInput(inp) { const g = this.game, i = g.input; i.left = inp.left; i.right = inp.right; i.up = inp.up; i.down = inp.down; i.fire = inp.fire; if (inp.jump && !this.jw) g.pressJump(); if (!inp.jump && this.jw) g.releaseJump(); this.jw = inp.jump; }
  resize(aspect) { const c = this.cam; c.aspect = aspect; this.dist = Math.max(17, 15 / (2 * Math.tan(c.fov * Math.PI / 360) * aspect)); c.updateProjectionMatrix(); this.game.setView(2 * this.dist * Math.tan(c.fov * Math.PI / 360) * aspect / U, 720); }

  layRow(x, instant) { const r = this.rows[this.ri = (this.ri + 1) % ROWS]; r.position.x = x * U + 1; r.userData.t = instant ? 1 : 0; r.position.y = instant ? 0.05 : 1.6; r.rotation.z = instant ? 0 : -0.5; }
  view(e) {
    let o = this.views.get(e.id); if (o) return o;
    const pool = this.pools[e.type] = this.pools[e.type] || []; o = pool.pop();
    if (!o) { const sc = this.scene; o = new THREE.Group();
      if (e.type === 'runner') o.add(makeBrak(e.id, 1.45));
      else if (e.type === 'heavy') { const r = makeRoller(); r.scale.setScalar(0.3); o.add(r); }
      else if (e.type === 'turret') { add(o, C(0.9, 1, 0.3, 16), MAT.steel, 0, 0.15, 0); add(o, C(0.5, 0.6, 0.9, 12), MAT.rust, 0, 0.6, 0); o.userData.lid = add(o, C(0.95, 0.95, 0.12, 16), MAT.yellow, 0, 0.36, 0); o.userData.gun = add(o, C(0.1, 0.1, 1.1, 8), MAT.dark, -0.5, 0.9, 0, 0, 0, Math.PI / 2); add(o, S(0.14), MAT.red, 0, 1.1, 0.3); }
      else { add(o, RB(1, 0.42, 0.7, 0.15), e.type === 'drone' ? MAT.shell : MAT.steel); add(o, B(2.1, 0.05, 0.1), MAT.steel, 0, 0.16, 0); for (const dx of [-1, 1]) add(o, C(0.5, 0.5, 0.02, 14), new THREE.MeshBasicMaterial({ color: '#8fa0d0', transparent: true, opacity: 0.3 }), dx, 0.3, 0).castShadow = false;
        if (e.type === 'drone') { add(o, B(0.6, 0.5, 0.6), MAT.kraft, 0, -0.5, 0); glow(o, '#ffc988', 1.6, 0, -0.5, 0.4, 1.4); } else { add(o, S(0.16), MAT.red, -0.3, -0.2, 0.2); glow(o, '#ff4020', 1.8, -0.3, -0.2, 0.3, 1.6); } }
      sc.add(o); }
    o.visible = true; this.views.set(e.id, o); o.userData.type = e.type; return o;
  }

  onEvent(e) {
    const fx = this.fx, p = this.game.player, X = v => v * U, Y = v => -v * U;
    switch (e.type) {
      case 'start': break;
      case 'shoot': this.flashT = 0.06; fx.spark(X(e.x), Y(e.y), 0.4, 3, '#ffd9a0', 4, 0.2); break;
      case 'enemyHit': fx.spark(X(e.x), Y(e.y), 0.3, 6, '#ffe6b0', 6, 0.3); break;
      case 'ping': fx.spark(X(e.x), Y(e.y), 0.3, 5, '#cfd3da', 6, 0.25); break;
      case 'kill': fx.boom(X(e.x), Y(e.y), 0.2, e.kind === 'heavy' ? 1.2 : 0.7); fx.hitStop(e.kind === 'heavy' ? 0.07 : 0.03); break;
      case 'crush': fx.boom(X(e.x), 0.8, 0, 0.8); break;
      case 'hit': case 'fall': fx.addShake(0.3); fx.hitStop(0.08); fx.spark(X(p.x), Y(p.y) + 1.3, 0.3, 16, '#ff8a5a', 8, 0.5); break;
      case 'pickup': fx.spark(X(e.x), Y(e.y), 0.3, 18, ITEM_COLOR[e.kind] || '#fff', 7, 0.6, 6); break;
      case 'lay': this.layRow(e.x, false); break;
      case 'land': fx.spark(X(p.x), 0.1, 0.5, 6, '#8b93b8', 2.5, 0.35, 2); break;
      case 'rescue': { const i = this.game.cages.findIndex(c => c.x === e.x); if (i >= 0) { this.cages[i].userData.helper.visible = false; fx.spark(X(e.x), 0.9, 0, 24, '#ffc988', 7, 0.6); fx.boom(X(e.x), 0.8, 0.2, 0.45); } break; }
      case 'cageLost': { const i = this.game.cages.findIndex(c => c.x === e.x); if (i >= 0) this.cages[i].visible = false; fx.boom(X(e.x), 0.8, 0, 0.9); break; }
      case 'helperLost': fx.spark(X(p.x) - 1.5, 0.8, 0, 14, '#ffb21e', 7, 0.6); break;
      case 'explosion': fx.boom(X(e.x), Y(e.y), 0.6, e.big ? 2 : 1); break;
      case 'bossHit': fx.spark(X(e.x), Y(e.y), 0.5, 5, '#ffe6b0', 7, 0.3); break;
      case 'helperShot': fx.spark(X(e.x), Y(e.y), 0.6, 8, '#ffc988', 7, 0.35); break;
      case 'bossStart': fx.addShake(0.35); break;
      case 'charge': case 'shake': fx.addShake(0.25); break;
      case 'win': if (this.game.endX) { fx.boom(X(this.game.endX) + 1, 3, 0, 2.6); fx.boom(X(this.game.endX), 1.5, 1.5, 2); } fx.addShake(0.5); break;
    }
  }

  update(dt) { const fx = this.fx; if (fx.stop > 0) { fx.stop -= dt; return; } this.game.update(dt); }

  frame(dt) {
    const g = this.game, p = g.player, fx = this.fx, t = this.t += dt, X = v => v * U, Y = v => -v * U, live = g.phase === 'running';
    fx.update(dt);
    // робот
    const px = X(p.x), py = Y(p.y), r = this.robot, f = p.facing;
    r.visible = !(live && p.invuln > 0 && p.shield <= 0 && Math.floor(t * 14) % 2 === 0);
    r.position.set(px, py, 0.3); r.rotation.y = f > 0 ? -0.35 : Math.PI + 0.35;
    let a = p.aimAngle; if (f < 0) a = Math.PI - a; a = Math.atan2(Math.sin(a), Math.cos(a));
    this.blink -= dt; if (this.blink < -0.12) this.blink = 2 + Math.random() * 3;
    r.userData.pose({ ph: p.run, run: Math.abs(p.vx) > 25 && !p.crouch, air: !p.onGround, vy: p.vy, crouch: p.crouch, aim: -a, hurt: Math.max(0, p.hurt), t, blink: this.blink < 0 });
    this.flashT = (this.flashT || 0) - dt; this.flash.visible = this.flashT > 0; if (this.flash.visible) this.flash.position.set(px + Math.cos(p.aimAngle) * 1.3, py + 1.75 - Math.sin(p.aimAngle) * 1.3, 0.7);
    this.lamp.position.set(px + f * 0.4, py + 2.6, 0.5); this.lamp.target.position.set(px + f * 9, 0.5, 0);
    this.warm.position.set(X(g.laidX) - 3, 3.2, 2.5);
    // бригада идёт след в след
    const tr = this.trail; if (live) { tr.i = (tr.i + 1) & 511; tr.x[tr.i] = p.x; tr.y[tr.i] = p.y; }
    while (this.helpers.length < g.helpers) { const h = makeHelper(this.tm, this.helpers.length); h.scale.setScalar(1.05); this.scene.add(h); this.helpers.push(h); }
    this.helpers.forEach((h, i) => { h.visible = i < g.helpers; if (!h.visible) return; const k = (tr.i - 16 - i * 8) & 511, k2 = (k - 3) & 511, hx = tr.x[k] - 30, hy = tr.y[k];
      h.position.set(X(hx), Math.max(0, Y(hy)), ((i * 37) % 5 - 2) * 0.5 - 0.2); const mv = Math.abs(tr.x[k] - tr.x[k2]) > 1.5; h.rotation.y = (tr.x[k] >= tr.x[k2] ? -0.5 : Math.PI + 0.5); h.userData.pose(t * 14 + i * 1.7, mv, hy < -4); });
    // плитка встаёт на место
    for (const row of this.rows) { if (row.userData.t >= 1) continue; const k = row.userData.t = Math.min(1, row.userData.t + dt * 4.5), e = 1 - (1 - k) * (1 - k); row.position.y = 0.05 + (1 - e) * 1.55; row.rotation.z = -(1 - e) * 0.5; if (k >= 1) fx.spark(row.position.x, 0.12, 2.2, 5, '#ffe2a0', 3, 0.3, 4); }
    // фонари и окна зажигаются позади
    for (const l of this.lamps) if (!l.on && l.x < g.laidX) { l.on = true; l.bulb.material = MAT.warm; l.gl.visible = true; fx.spark(l.x * U, 5.2, -4.4, 8, '#ffc988', 2, 0.5, 2); }
    for (const b of this.lit) if (!b.on && b.x < g.laidX - 200) { b.on = true; b.m.emissiveIntensity = 2.6; }
    // укладчик
    const c = g.chaser; if (c) { this.paver.position.set(X(c.x) - 7.5, Math.sin(t * 22) * 0.03, -0.4); this.paver.rotation.z = c.stun > 0 ? 0.02 : Math.sin(t * 9) * 0.008;
      if (live && Math.random() < 0.5) fx.spark(X(c.x) - 0.5, 0.2, (Math.random() - 0.5) * 4, 1, '#ff9a4a', 5, 0.4);
      if (live && c.x > p.x - 420) fx.addShake(0.06); }
    // клетки
    (g.cages || []).forEach((cg, i) => { const o = this.cages[i]; if (cg.open && o.visible && o.userData.helper.visible === false) { o.scale.y = Math.max(0.05, o.scale.y - dt * 4); if (o.scale.y <= 0.06) { o.visible = false; o.scale.y = 1; } } else if (!cg.open) o.userData.helper.position.y = Math.abs(Math.sin(t * 5 + i)) * 0.12; });
    // враги
    for (const [id, o] of this.views) o.userData.seen = false;
    for (const e of g.enemies) { const o = this.view(e); o.userData.seen = true; const s = 1 + Math.max(0, e.flash) * 2.5; o.scale.setScalar(s);
      if (e.type === 'runner') { o.position.set(X(e.x), Y(e.y) + Math.abs(Math.sin(t * 12 + e.id)) * 0.12, 0); o.rotation.y = e.dir > 0 ? Math.PI : 0; o.rotation.z = Math.sin(t * 12 + e.id) * 0.08; }
      else if (e.type === 'heavy') { o.position.set(X(e.x), Y(e.y), 0); o.rotation.y = e.dir > 0 ? Math.PI : 0; o.rotation.z = e.state === 'windup' ? Math.sin(t * 40) * 0.03 : 0; }
      else if (e.type === 'turret') { o.position.set(X(e.x), Y(e.y), 0); o.userData.lid.position.y = 0.36 + e.k * 1; o.userData.lid.rotation.z = e.k * 0.5; o.userData.gun.visible = e.k > 0.3; o.userData.gun.rotation.z = Math.PI / 2 - (Math.PI - e.ang) * (e.k > 0.3 ? 1 : 0); }
      else { o.position.set(X(e.x), Y(e.y), 0); o.rotation.z = Math.sin(t * 3 + e.id) * 0.08; } }
    for (const [id, o] of this.views) if (!o.userData.seen) { o.visible = false; this.pools[o.userData.type].push(o); this.views.delete(id); }
    // снаряды и бонусы
    this.shots.forEach((s, i) => { const b = g.bullets[i]; s.visible = !!b; if (b) { s.position.set(X(b.x), Y(b.y), 0.4); s.rotation.z = -b.a; s.scale.setScalar(b.size); } });
    this.eshots.forEach((s, i) => { const b = g.ebullets[i]; s.visible = !!b; if (b) { s.position.set(X(b.x), Math.max(0.15, Y(b.y)), 0.3); s.scale.setScalar(b.r / 9); } });
    this.items.forEach((s, i) => { const it = g.items[i]; s.visible = !!it; if (it) { s.position.set(X(it.x), Y(it.y) + 0.2 + Math.sin(t * 4) * 0.08, 0.3); s.rotation.y = t * 2; const col = ITEM_COLOR[it.kind] || '#fff'; s.userData.m.color.set(col); s.userData.m.emissive.set(col); s.userData.gl.material.color.set(col); } });
    // камера
    const cam = this.cam, cx = X(g.cam.x + g.view.w * (g.phase === 'menu' && cam.aspect > 1.2 ? 0.2 : 0.5)), sh = fx.shake;
    cam.position.set(cx + (Math.random() - 0.5) * sh, 2.7 + (Math.random() - 0.5) * sh, this.dist); cam.lookAt(cx, 2.9, 0);
    this.moon.position.set(cx - 8, 16, -12); this.moon.target.position.set(cx, 0, 0); this.rainG.position.x = cx;
  }
  dispose() { this.off(); }
}
