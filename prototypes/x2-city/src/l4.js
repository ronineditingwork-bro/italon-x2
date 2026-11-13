// Уровень 4 «Погоня к рассвету»: камера за спиной робота, улица уходит к солнцу. Правила — chase.js.
// Мир не строится на всю длину: дома, фонари и плиты переставляются вперёд по кольцу.
import { THREE, MAT, add, B, C, S, RB, rnd, glow, smoke, building, makeX2, makeHelper, makeBrak, makeExcavator, barrier, cage, sky } from './kit.js';
import { ChaseGame, CHASE } from './chase.js';
import { Fx } from './fx.js';

const K = CHASE, RING = 14, STEP = 11, ROWS = 26;
export class Level4 {
  constructor(ctx) {
    this.ctx = ctx; this.name = 'Погоня к рассвету'; this.hint = 'Экскаватор бежит и крушит улицу. Догоните его до рассвета.';
    this.hints = ctx.touch ? [[1, 'Крестовина влево и вправо — сменить полосу'], [5, 'A — прыжок через барьер'], [9, 'B — огонь по «браку» и клеткам'], [13, 'Обломки не пробить — объезжайте']] : [[1, 'A и D — сменить полосу'], [5, 'Пробел — прыжок через барьер'], [9, 'J или мышь — огонь по «браку» и клеткам'], [13, 'Обломки не пробить — объезжайте']];
    const g = this.game = new ChaseGame(), sc = this.scene = new THREE.Scene(), tm = this.tm = ctx.tm, hi = ctx.quality === 'high';
    this.cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 900); this.t = 0; this.fx = new Fx(sc, hi ? 320 : 160, ctx.reduced);
    this.world = new THREE.Group(); sc.add(this.world);                  // всё, что едет за камерой: небо, солнце, земля
    sky(this.world, [[0, '#16245a'], [0.3, '#4a4a90'], [0.43, '#d8786e'], [0.485, '#ffc98a'], [0.5, '#fff0c0'], [0.515, '#2a1e2c'], [1, '#0a0a10']], false);
    sc.fog = new THREE.FogExp2('#b9786e', 0.0062);
    this.hemi = new THREE.HemisphereLight('#9a9ad8', '#2a1c20', 0.5); sc.add(this.hemi);
    const sunL = this.sunL = new THREE.DirectionalLight('#ffb27a', 0.85); if (hi) { sunL.castShadow = true; sunL.shadow.mapSize.set(1024, 1024); Object.assign(sunL.shadow.camera, { left: -12, right: 12, top: 30, bottom: -14, near: 1, far: 90 }); sunL.shadow.bias = -0.002; } sc.add(sunL, sunL.target);
    const fill = new THREE.DirectionalLight('#6a7ad0', 0.3); fill.position.set(3, 10, 14); this.world.add(fill);
    add(this.world, new THREE.PlaneGeometry(70, 520), new THREE.MeshStandardMaterial({ color: '#161a26', roughness: 0.8 }), 0, 0, -200, -Math.PI / 2).castShadow = false;
    const sun = new THREE.Mesh(new THREE.CircleGeometry(30, 40), new THREE.MeshBasicMaterial({ color: '#fff4d0', fog: false })); sun.position.set(0, 46, -380); this.world.add(sun); glow(this.world, '#ffc070', 200, 0, 46, -370, 1.6);
    this.exc = makeExcavator(); this.exc.scale.setScalar(2.2); this.exc.traverse(o => { if (o.material && o.material.roughness === 1) o.material.fog = false; }); this.world.add(this.exc);
    // кольцо домов, фонарей и разметки
    this.ring = Array.from({ length: RING }, (_, i) => { const gp = new THREE.Group(); sc.add(gp);
      for (const sd of [-1, 1]) { building(gp, 10, 12 + rnd(i, sd + 2) * 20, 10, sd * (13 + rnd(i, sd) * 2), 0, i % 4 === 0 ? 1 : 0, '#1c1830').castShadow = false;
        add(gp, C(0.09, 0.12, 5.4, 8), MAT.steel, sd * 6.2, 2.7, 3); add(gp, B(1.4, 0.09, 0.09), MAT.steel, sd * 5.55, 5.4, 3); add(gp, RB(0.7, 0.14, 0.3, 0.05), MAT.warm, sd * 5, 5.32, 3); glow(gp, '#ffb060', 1.8, sd * 5, 5.2, 3, 2.2); }
      for (const x of [-1.2, 1.2]) add(gp, B(0.14, 0.02, 3.2), new THREE.MeshBasicMaterial({ color: '#6a6680' }), x, 0.02, 0).castShadow = false; return gp; });
    const rowMat = tm.map(m => { const t = m.map.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 1); t.needsUpdate = true; const r = m.clone(); r.map = t; r.emissiveMap = t; return r; });
    this.rows = Array.from({ length: ROWS }, (_, i) => { const m = add(sc, B(7.4, 0.1, 2 - 0.03), rowMat[i % rowMat.length], 0, -9, 0); m.castShadow = false; m.userData.t = 1; return m; }); this.ri = 0; this.laidZ = 0;
    this.robot = makeX2(tm); this.robot.rotation.y = Math.PI / 2; this.robot.scale.setScalar(1.1); sc.add(this.robot);
    this.helpers = []; this.views = new Map(); this.pools = {};
    this.shots = Array.from({ length: 16 }, () => { const gp = new THREE.Group(); add(gp, B(0.34, 0.07, 0.34), tm[0]).castShadow = false; add(gp, B(0.1, 0.04, 1.4), MAT.warm, 0, 0, 0.9).castShadow = false; glow(gp, '#ffd080', 1, 0, 0, 0, 2.2); gp.visible = false; sc.add(gp); return gp; });
    this.streaks = Array.from({ length: hi ? 18 : 8 }, (_, i) => { const m = add(sc, B(0.03, 0.03, 5 + rnd(i, 1) * 5), new THREE.MeshBasicMaterial({ color: '#fff0d8', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), (i % 2 ? 1 : -1) * (5 + rnd(i, 2) * 4), 0.5 + rnd(i, 3) * 6, 0); m.castShadow = false; m.userData.o = rnd(i, 4) * 60; return m; });
    this.off = g.on(e => this.onEvent(e)); this.reset();
  }
  reset() { this.rows.forEach(r => { r.position.y = -9; }); this.laidZ = -24; for (const [, o] of this.views) o.visible = false; this.views.clear(); this.pools = {}; }
  start() { this.game.start(); this.reset(); }
  get state() { const p = this.game.phase; return p === 'won' ? 'won' : p === 'over' ? 'lost' : 'running'; }
  hud() { const g = this.game, p = g.player; return { hearts: p.hearts, max: K.maxHearts, helpers: g.helpers, total: g.total, area: g.area, weapon: 'Плита', shield: 0, progress: Math.min(1, g.d / K.dist), midLabel: 'До рассвета' }; }
  stats() { return this.game.summary(); }
  setInput(inp) { const g = this.game, i = g.input; i.left = inp.left; i.right = inp.right; i.fire = inp.fire; if ((inp.jump || inp.up) && !this.jw) g.pressJump(); this.jw = inp.jump || inp.up; }
  resize(aspect) { const c = this.cam; c.aspect = aspect; c.fov = aspect < 1 ? 68 : 50; c.updateProjectionMatrix(); }
  onEvent(e) { const fx = this.fx, g = this.game, p = g.player, Z = z => -z;
    switch (e.type) {
      case 'shoot': fx.spark(p.x, 1.6, Z(g.d) - 1.2, 2, '#ffd9a0', 3, 0.15); break;
      case 'enemyHit': case 'ping': fx.spark(e.x, 1.2, Z(e.z), 6, '#ffe6b0', 6, 0.3); break;
      case 'kill': fx.boom(e.x, 1, Z(e.z), 0.8); fx.hitStop(0.02); break;
      case 'hit': fx.addShake(0.45); fx.hitStop(0.08); fx.boom(e.x, 1, Z(e.z), 0.9); break;
      case 'rescue': fx.spark(e.x, 0.9, Z(e.z), 24, '#ffc988', 7, 0.6); break;
      case 'pickup': fx.spark(e.x, 1, Z(e.z), 18, '#ff5a6a', 7, 0.6, 6); break;
      case 'land': fx.spark(p.x, 0.1, Z(g.d), 6, '#c9a890', 2.5, 0.35, 2); break;
      case 'win': fx.addShake(0.5); for (let i = 0; i < 4; i++) fx.boom((i - 1.5) * 3, 3 + i, Z(g.d) - 26, 2.4); break;
    } }
  update(dt) { const fx = this.fx; if (fx.stop > 0) { fx.stop -= dt; return; } this.game.update(dt); }
  view(o) { let v = this.views.get(o); if (v) return v; const pool = this.pools[o.kind] = this.pools[o.kind] || []; v = pool.pop();
    if (!v) { v = new THREE.Group(); const sc = this.scene;
      if (o.kind === 'barrier') barrier(v, 0, 0, 0); else if (o.kind === 'brak') { const b = makeBrak(o.z | 0, 1.7); b.rotation.y = -Math.PI / 2; v.add(b); }
      else if (o.kind === 'boulder') { add(v, new THREE.IcosahedronGeometry(1.25, 0), MAT.concrete, 0, 1.1, 0, 0.4, 0.7, 0.2); v.userData.sh = add(v, C(1.3, 1.3, 0.02, 20), new THREE.MeshBasicMaterial({ color: '#ff4020', transparent: true, opacity: 0.35, depthWrite: false }), 0, 0.04, 0); v.userData.sh.castShadow = false; }
      else if (o.kind === 'cage') { const c = cage(v, this.tm, 0, 0); c.rotation.y = Math.PI / 2; } else { add(v, RB(0.7, 0.7, 0.7, 0.14), new THREE.MeshStandardMaterial({ color: '#ff5a6a', emissive: '#ff5a6a', emissiveIntensity: 0.7 }), 0, 1, 0); glow(v, '#ff5a6a', 2.2, 0, 1, 0, 1.6); }
      sc.add(v); }
    v.visible = true; v.userData.kind = o.kind; this.views.set(o, v); return v; }
  frame(dt) {
    const g = this.game, p = g.player, fx = this.fx, t = this.t += dt, live = g.phase === 'running', pz = -g.d, k = Math.min(1, g.d / K.dist); fx.update(dt);
    const r = this.robot; r.visible = !(live && p.invuln > 0 && Math.floor(t * 14) % 2 === 0); r.position.set(p.x, p.y, pz); r.rotation.z = (K.lanes[p.lane] - p.x) * -0.12;
    r.userData.pose({ ph: p.run, run: live || g.phase === 'menu', air: p.y > 0, vy: -p.vy, crouch: false, aim: 0, hurt: Math.max(0, p.hurt), t });
    while (this.helpers.length < g.helpers) { const h = makeHelper(this.tm, this.helpers.length); h.rotation.y = Math.PI / 2; h.scale.setScalar(1.05); h.userData.x = 0; this.scene.add(h); this.helpers.push(h); }
    this.helpers.forEach((h, i) => { h.visible = i < g.helpers; if (!h.visible) return; const row = Math.floor(Math.sqrt(i * 2 + 0.25) - 0.5) + 1, tx = p.x + ((i * 37) % 7 - 3) * 0.28 * row; h.userData.x += (tx - h.userData.x) * Math.min(1, dt * (7 - row)); h.position.set(h.userData.x, 0, pz + 1.3 + row * 1.15); h.userData.pose(t * 16 + i * 1.7, true, false); });
    // плитка ложится под роботом
    while (this.laidZ < g.d + 2) { const row = this.rows[this.ri = (this.ri + 1) % ROWS]; row.position.set(0, 1.5, -this.laidZ); row.userData.t = this.laidZ < g.d - 4 ? 1 : 0; this.laidZ += 2; }
    for (const row of this.rows) { if (row.userData.t >= 1) { if (row.position.y > 0.06 && row.position.y < 2) row.position.y = 0.05; continue; } const q = row.userData.t = Math.min(1, row.userData.t + dt * 6), e = 1 - (1 - q) * (1 - q); row.position.y = 0.05 + (1 - e) * 1.4; }
    // кольцо улицы
    const base = Math.floor(g.d / STEP); this.ring.forEach((gp, i) => { const n = base - 2 + ((i - base % RING + RING) % RING); gp.position.z = -n * STEP; });
    this.streaks.forEach(s => { s.position.z = pz + 8 - ((g.d * 1.6 + s.userData.o) % 60); s.visible = live; });
    for (const [o, v] of this.views) if (o.done && o.kind !== 'barrier' && o.kind !== 'boulder' || o.z < g.d - 2) { v.visible = false; this.pools[v.userData.kind].push(v); this.views.delete(o); }
    for (const o of g.objs) { if (o.z < g.d - 2 || o.z > g.d + 150 || (o.done && o.kind !== 'barrier' && o.kind !== 'boulder')) continue; const v = this.view(o), dz = o.z - g.d; v.position.set(o.x, 0, -o.z); v.scale.setScalar(1 + Math.max(0, o.flash) * 2.5);
      if (o.kind === 'boulder') { const m = v.children[0]; m.position.y = 1.1 + Math.max(0, dz - 18) * 0.55; m.rotation.x = t * 2 + o.z; v.userData.sh.material.opacity = dz > 18 ? 0.2 + 0.25 * Math.abs(Math.sin(t * 8)) : 0; }
      else if (o.kind === 'brak') v.position.y = Math.abs(Math.sin(t * 10 + o.z)) * 0.15; else if (o.kind === 'heart') v.rotation.y = t * 2; }
    this.shots.forEach((s, i) => { const b = g.bullets[i]; s.visible = !!b; if (b) s.position.set(b.x, 1.5, -b.z); });
    // рассвет: чем ближе экскаватор, тем светлее
    this.hemi.intensity = 0.45 + k * 0.45; this.sunL.intensity = 0.8 + k * 0.5; this.exc.position.set(-4 + Math.sin(t * 0.7) * 1.5, Math.abs(Math.sin(t * 5)) * 0.6, -(150 - k * 118));
    this.world.position.z = pz; this.sunL.position.set(2, 12, pz - 40); this.sunL.target.position.set(0, 0, pz);
    const cam = this.cam, sh = fx.shake, port = cam.aspect < 1; cam.position.set(p.x * 0.55 + (Math.random() - 0.5) * sh, (port ? 7.4 : 6.6) + (Math.random() - 0.5) * sh, pz + (port ? 14 : 13)); cam.lookAt(p.x * 0.4, 2, pz - 16);   // выше и дальше: бригаду за роботом видно
  }
  dispose() { this.off(); }
}
