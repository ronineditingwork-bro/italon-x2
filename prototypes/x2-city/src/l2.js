// Уровень 2 «Захват двора»: вид сверху в 3D. Правила — yard.js; здесь только картинка.
import { THREE, MAT, add, B, C, S, RB, rnd, glow, lampLight, building, makeX2, makeHelper, makeBrak, makeRoller, car, tree, barrier, cage } from './kit.js';
import { YardGame, YARD } from './yard.js';
import { Fx } from './fx.js';

const Y = YARD;
export class Level2 {
  constructor(ctx) {
    this.ctx = ctx; this.name = 'Захват двора'; this.hint = '«Брак» лезет со всех сторон и ломает плитку. Замостите двор.';
    this.hints = [[1, 'Ходите по двору — плитка ложится под роботом'], [5, ctx.touch ? 'B — огонь по ближайшему «браку»' : 'J или мышь — огонь по ближайшему «браку»'], [9, ctx.touch ? 'A — рывок' : 'Пробел — рывок'], [13, 'Клетки по краям — новые помощники']];
    const g = this.game = new YardGame(), sc = this.scene = new THREE.Scene(), tm = this.tm = ctx.tm, hi = ctx.quality === 'high';
    this.cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 300); this.t = 0; this.fx = new Fx(sc, hi ? 360 : 180, ctx.reduced);
    sc.background = new THREE.Color('#05070f'); sc.fog = new THREE.Fog('#0a0f22', 45, 95);
    sc.add(new THREE.HemisphereLight('#6a7cc0', '#141624', 0.45));
    const moon = new THREE.DirectionalLight('#a9c2ff', 0.75); moon.position.set(-14, 22, -8); if (hi) { moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048); Object.assign(moon.shadow.camera, { left: -24, right: 24, top: 20, bottom: -20, near: 1, far: 80 }); moon.shadow.bias = -0.002; } sc.add(moon);
    this.warm = new THREE.PointLight('#ffb878', 1, 15, 2); sc.add(this.warm);
    add(sc, new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: '#161a26', roughness: 0.85 }), 0, 0, 0, -Math.PI / 2).castShadow = false;   // матовый: сверху мокрый асфальт даёт белый блик
    // плитка: по одной плите на клетку, показывается при укладке
    const geo = B(Y.cell - 0.05, 0.14, Y.cell - 0.05);
    this.tiles = Array.from(g.cells, (_, i) => { const m = new THREE.Mesh(geo, tm[(i * 7 + (i >> 3)) % tm.length]); m.position.set(g.cx(i), 0.07, g.cz(i)); m.receiveShadow = true; m.visible = false; m.userData.t = 1; sc.add(m); return m; });
    for (let ix = -8; ix <= 8; ix += 4) for (let k = -3; k <= 3; k++) add(sc, B(0.1, 0.02, 2.2), new THREE.MeshBasicMaterial({ color: '#2c3350' }), ix * Y.cell, 0.02, k * 3.2).castShadow = false;
    // двор: фонари и деревья оживают, когда под ними ложится плитка
    this.lamps = [[-6.4, -4.8], [6.4, -4.8], [-6.4, 4.8], [6.4, 4.8], [0, -9.6], [0, 9.6]].map(([x, z], i) => { const gp = new THREE.Group(); gp.position.set(x, 0, z); gp.rotation.y = i * 1.3; sc.add(gp); add(gp, C(0.09, 0.12, 5.4, 8), MAT.steel, 0, 2.7, 0); add(gp, B(1.4, 0.09, 0.09), MAT.steel, 0.65, 5.4, 0);
      const bulb = add(gp, RB(0.7, 0.14, 0.3, 0.05), MAT.dark, 1.2, 5.32, 0), gl = lampLight(gp, 2.2); return { c: g.cellAt(x, z), bulb, gl, on: false }; });
    this.trees = [[-11.2, 0], [11.2, 0], [-3.2, 8], [3.2, -8], [-12.8, -8], [12.8, 8]].map(([x, z]) => { const gp = new THREE.Group(); sc.add(gp); tree(gp, x, z, false); const leaves = gp.children.slice(1); return { c: g.cellAt(x, z), leaves, on: false }; });
    for (let i = 0; i < 10; i++) { building(sc, 9, 5 + rnd(i, 3) * 6, 7, -41 + i * 9.2, -g.h / 2 - 9, i % 3 ? 0 : 1).castShadow = false; if (i < 6) for (const sd of [-1, 1]) building(sc, 7, 5 + rnd(i, 4 + sd) * 5, 8, sd * (g.w / 2 + 9), -18 + i * 8.5, 0).castShadow = false; }
    car(sc, -g.w / 2 - 3, 5, 1.5); car(sc, g.w / 2 + 3, -6, 1.6, '#2a2032'); barrier(sc, 8, g.h / 2 + 2, 0.2); barrier(sc, -9, g.h / 2 + 2.5, -0.2); car(sc, 2, g.h / 2 + 4, 0.1);
    this.cages = g.cages.map(c => cage(sc, tm, c.x, c.z));
    this.robot = makeX2(tm); this.robot.scale.setScalar(1.25); sc.add(this.robot);
    this.helpers = []; this.views = new Map(); this.pools = { r: [], h: [] };
    this.shots = Array.from({ length: 40 }, () => { const gp = new THREE.Group(); add(gp, B(0.4, 0.08, 0.4), tm[0]).castShadow = false; add(gp, B(1, 0.04, 0.1), MAT.warm, -0.7, 0, 0).castShadow = false; glow(gp, '#ffd080', 0.9, 0, 0, 0, 2.2); gp.visible = false; sc.add(gp); return gp; });
    this.items = Array.from({ length: 3 }, () => { const gp = new THREE.Group(); add(gp, RB(0.6, 0.6, 0.6, 0.12), new THREE.MeshStandardMaterial({ color: '#ff5a6a', emissive: '#ff5a6a', emissiveIntensity: 0.7 })); glow(gp, '#ff5a6a', 2, 0, 0, 0, 1.6); gp.visible = false; sc.add(gp); return gp; });
    this.off = g.on(e => this.onEvent(e)); this.reset();
  }
  reset() { const g = this.game; this.tiles.forEach((m, i) => { m.visible = !!g.cells[i]; m.userData.t = 1; m.position.y = 0.07; m.rotation.set(0, 0, 0); }); this.cages.forEach(o => { o.visible = true; o.scale.y = 1; });
    this.lamps.forEach(l => { l.on = false; l.bulb.material = MAT.dark; l.gl.visible = false; }); this.trees.forEach(t => { t.on = false; t.leaves.forEach(m => { m.material = MAT.leafD; }); }); }
  start() { this.game.start(); this.reset(); }
  get state() { const p = this.game.phase; return p === 'won' ? 'won' : p === 'over' ? 'lost' : 'running'; }
  hud() { const g = this.game, p = g.player; return { hearts: p.hearts, max: Y.maxHearts, helpers: g.helpers.length, total: g.total, area: g.area, weapon: p.dashCd > 0 ? 'Плита' : 'Плита · рывок готов', shield: 0, progress: Math.min(1, g.frac / Y.goal), midLabel: 'Замощено' }; }
  stats() { return this.game.summary(); }
  setInput(inp) { const g = this.game, i = g.input; i.left = inp.left; i.right = inp.right; i.up = inp.up; i.down = inp.down; i.fire = inp.fire; if (inp.jump && !this.jw) g.pressJump(); this.jw = inp.jump; }
  resize(aspect) { const c = this.cam; c.aspect = aspect; this.k = Math.max(1, 1.5 / aspect); c.updateProjectionMatrix(); }
  onEvent(e) { const fx = this.fx, g = this.game;
    switch (e.type) {
      case 'lay': { const m = this.tiles[e.i]; m.visible = true; m.userData.t = 0; break; }
      case 'unlay': { const m = this.tiles[e.i]; m.visible = false; fx.spark(m.position.x, 0.2, m.position.z, 10, '#8b93b8', 5, 0.5); break; }
      case 'shoot': fx.spark(e.x + g.player.ax, 1.6, e.z + g.player.az, 2, '#ffd9a0', 3, 0.15); break;
      case 'enemyHit': fx.spark(e.x, 1, e.z, 6, '#ffe6b0', 6, 0.3); break;
      case 'kill': fx.boom(e.x, 0.9, e.z, e.kind === 'heavy' ? 1.3 : 0.7); fx.hitStop(e.kind === 'heavy' ? 0.07 : 0.02); break;
      case 'hit': fx.addShake(0.4); fx.hitStop(0.08); fx.spark(g.player.x, 1.3, g.player.z, 16, '#ff8a5a', 8, 0.5); break;
      case 'rescue': { const i = g.cages.findIndex(c => c.x === e.x && c.z === e.z); if (i >= 0) this.cages[i].visible = false; fx.spark(e.x, 0.9, e.z, 24, '#ffc988', 7, 0.6); break; }
      case 'pickup': fx.spark(e.x, 0.8, e.z, 18, '#ff5a6a', 7, 0.6, 6); break;
      case 'jump': fx.spark(g.player.x, 0.2, g.player.z, 8, '#8b93b8', 4, 0.3, 2); break;
    } }
  update(dt) { const fx = this.fx; if (fx.stop > 0) { fx.stop -= dt; return; } this.game.update(dt); }
  view(e) { let o = this.views.get(e.id); if (o) return o; const k = e.heavy ? 'h' : 'r'; o = this.pools[k].pop();
    if (!o) { o = new THREE.Group(); if (e.heavy) { const r = makeRoller(); r.scale.setScalar(0.3); o.add(r); } else o.add(makeBrak(e.id, 1.9)); this.scene.add(o); }
    o.visible = true; o.userData.k = k; this.views.set(e.id, o); return o; }
  frame(dt) {
    const g = this.game, p = g.player, fx = this.fx, t = this.t += dt, live = g.phase === 'running'; fx.update(dt);
    const r = this.robot; r.visible = !(live && p.invuln > 0 && p.dash <= 0 && Math.floor(t * 14) % 2 === 0); r.position.set(p.x, 0, p.z);
    const fire = g.input.fire, ax = fire ? p.ax : p.fx, az = fire ? p.az : p.fz; r.rotation.y = -Math.atan2(az, ax);
    r.userData.pose({ ph: p.run, run: p.moving, air: p.dash > 0, vy: 0, crouch: false, aim: 0, hurt: Math.max(0, p.hurt), t });
    this.warm.position.set(p.x, 3.5, p.z);
    while (this.helpers.length < g.helpers.length) { const h = makeHelper(this.tm, this.helpers.length); h.scale.setScalar(1.45); this.scene.add(h); this.helpers.push(h); }
    this.helpers.forEach((h, i) => { const s = g.helpers[i]; h.visible = !!s; if (!s) return; h.position.set(s.x, 0, s.z); h.rotation.y = -Math.atan2(s.dz, s.dx); h.userData.pose(t * 14 + i * 1.7, s.moving, false); });
    for (const m of this.tiles) { if (m.userData.t >= 1) continue; const k = m.userData.t = Math.min(1, m.userData.t + dt * 5), e = 1 - (1 - k) * (1 - k); m.position.y = 0.07 + (1 - e) * 1.4; m.rotation.x = (1 - e) * 0.6; if (k >= 1) fx.spark(m.position.x, 0.15, m.position.z, 3, '#ffe2a0', 2.5, 0.3, 4); }
    for (const l of this.lamps) { const on = !!g.cells[l.c]; if (on !== l.on) { l.on = on; l.bulb.material = on ? MAT.warm : MAT.dark; l.gl.visible = on; } }
    for (const tr of this.trees) { const on = !!g.cells[tr.c]; if (on !== tr.on) { tr.on = on; tr.leaves.forEach(m => { m.material = on ? MAT.leaf : MAT.leafD; }); } }
    g.cages.forEach((c, i) => { if (!c.open) this.cages[i].userData.helper.position.y = Math.abs(Math.sin(t * 5 + i)) * 0.12; });
    for (const [, o] of this.views) o.userData.seen = false;
    for (const e of g.enemies) { const o = this.view(e); o.userData.seen = true; o.position.set(e.x, e.heavy ? 0 : Math.abs(Math.sin(t * 12 + e.id)) * 0.15, e.z); o.rotation.y = Math.PI - Math.atan2(e.dz, e.dx); o.scale.setScalar(1 + Math.max(0, e.flash) * 2.5); }
    for (const [id, o] of this.views) if (!o.userData.seen) { o.visible = false; this.pools[o.userData.k].push(o); this.views.delete(id); }
    this.shots.forEach((s, i) => { const b = g.bullets[i]; s.visible = !!b; if (b) { s.position.set(b.x, 1.5, b.z); s.rotation.y = -Math.atan2(b.vz, b.vx); } });
    this.items.forEach((s, i) => { const it = g.items[i]; s.visible = !!it; if (it) { s.position.set(it.x, 0.7 + Math.sin(t * 4) * 0.1, it.z); s.rotation.y = t * 2; } });
    const cam = this.cam, k = this.k, f = k > 1 ? 0.8 : 0.45, cx = p.x * f, cz = p.z * f, sh = fx.shake, d = 21 * (k > 1 ? 0.8 + k * 0.25 : 1);
    cam.position.set(cx + (Math.random() - 0.5) * sh, d + (Math.random() - 0.5) * sh, cz + d * 0.95); cam.lookAt(cx, 0, cz + 0.5);
  }
  dispose() { this.off(); }
}
