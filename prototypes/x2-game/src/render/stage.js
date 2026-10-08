// Сцена Three.js: камера, свет, мир, робот, эффекты. Читает состояние игры и события, сама правил не знает.
import * as THREE from '../../vendor/three.module.js';
import { CONFIG, DERIVED } from '../config.js';
import { rowZ } from '../track.js';
import { createRobot } from './robot.js';
import { createWorld } from './world.js';
import { createFx } from './fx.js';

export function webglSupported() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function skyTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const ctx = c.getContext('2d'), g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#8fb9e6'); g.addColorStop(0.55, '#cfe0ef'); g.addColorStop(1, '#f0e6d2');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Stage {
  constructor(canvas, game, qualityName) {
    this.canvas = canvas; this.game = game;
    this.qualityName = qualityName;
    this.q = { name: qualityName, ...CONFIG.quality[qualityName] };
    this.time = 0; this.shake = 0; this.blend = 0; this.disposed = false;

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: qualityName === 'high', powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = this.q.shadows; r.shadowMap.type = THREE.PCFSoftShadowMap;

    const s = this.scene = new THREE.Scene();
    s.background = skyTexture();
    s.fog = new THREE.Fog(0xe9e2d3, 38, 105);

    this.camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 220);
    s.add(new THREE.HemisphereLight(0xdbe8ff, 0xc2a885, 1.7));
    const sun = this.sun = new THREE.DirectionalLight(0xffe2b8, 2.7);
    sun.position.set(-10, 17, 9);
    if (this.q.shadows) {
      sun.castShadow = true; sun.shadow.mapSize.set(this.q.shadowMap, this.q.shadowMap);
      const sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 60;
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    }
    s.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0xfff0dc, 1.0); fill.position.set(14, 9, 8); s.add(fill);

    this.robot = createRobot(); s.add(this.robot.root);
    this.robot.root.traverse(o => { if (o.isMesh) o.castShadow = this.q.shadows; });
    this.fx = createFx(this.q.particles, (row, col, x, y, z) => this.landed(row, col, x, y, z)); s.add(this.fx.group);
    this.buildWorld();

    this.unsubscribe = game.on(e => this.onEvent(e));
    this.resize();
    this._v = new THREE.Vector3(); this._look = new THREE.Vector3();
  }

  buildWorld() {
    if (this.world) { this.scene.remove(this.world.group); this.world.dispose(); }
    this.world = createWorld(this.game, this.q);
    this.scene.add(this.world.group);
    this.worldDirty = false;
  }

  landed(row, col, x, y, z) {
    this.world.placeTile(row, col);
    this.fx.burst(x, 0.15, z, this.q.name === 'high' ? 4 : 2, 1.2, 1.8);
    this.worldDirty = true;
  }

  onEvent(e) {
    switch (e.type) {
      case 'start':
        if (this.worldDirty) this.buildWorld();
        this.fx.clear(); this.blend = Math.min(this.blend, 0.001); this.shake = 0;
        break;
      case 'lay': {
        const from = this.robot.feedWorld(this._v.clone());
        const to = new THREE.Vector3(DERIVED.columnX[e.col], 0.08, rowZ(e.row));
        this.fx.spawnSlab(from, to, e.row, e.col, e.order * 0.045);
        if (e.order === 0) this.robot.kick();
        break;
      }
      case 'pickup': {
        const p = this.world.pickupPosition(e.id);
        this.world.takePickup(e.id); this.worldDirty = true;
        if (p) this.fx.burst(p.x, 1.1, p.z, 22, 3.4, 4.5);
        break;
      }
      case 'hit':
        this.world.knock(e.id); this.worldDirty = true; this.shake = 0.5;
        break;
      case 'land':
        this.fx.burst(this.game.x, 0.1, this.game.z, 3, 1, 1.2);
        break;
    }
  }

  resize() {
    const w = this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.aspect = w / Math.max(1, h);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  /** dt — секунды. paused: сцена не анимируется, просто перерисовывается. */
  update(dt, paused = false, draw = true) {
    if (this.disposed) return;
    const g = this.game;
    if (!paused) {
      this.time += dt;
      const targetX = DERIVED.laneX[g.lane];
      this.robot.update(dt, {
        running: g.phase === 'running', y: g.y, vx: (targetX - g.x) * 3.2,
        invuln: g.invuln, showcase: g.phase === 'menu',
      });
      this.robot.root.position.set(g.x, g.y, g.z);
      this.fx.update(dt);
      this.world.update(dt, this.time, g.z);
      this.shake = Math.max(0, this.shake - dt * 1.4);
    }
    this.placeCamera(dt, paused);
    // тени следуют за роботом
    this.sun.position.set(g.x - 10, 17, g.z - 4 + 9); this.sun.target.position.set(g.x, 0, g.z - 4);
    if (draw) this.renderer.render(this.scene, this.camera);
  }

  placeCamera(dt, paused) {
    const g = this.game, cfg = this.aspect < 0.95 ? CONFIG.camera.portrait : CONFIG.camera.landscape;
    const target = g.phase === 'menu' ? 0 : 1;
    if (!paused) this.blend += (target - this.blend) * Math.min(1, dt * 2.4);
    const b = this.blend, ease = b * b * (3 - 2 * b);
    const cx = g.x * CONFIG.camera.follow;
    // игровая камера: сверху и сзади, видны путь впереди и результат позади
    const runPos = this._v.set(cx, cfg.height, g.z + cfg.back);
    const runLook = this._look.set(cx * 0.6, cfg.lookY, g.z - cfg.ahead);
    // камера меню: спереди, видны лицо и коробка
    const wide = this.aspect >= 0.95;
    const mPos = new THREE.Vector3(wide ? 0.4 : 0.9, wide ? 1.4 : 1.7, g.z + (wide ? 4.6 : 9.6));
    const mLook = new THREE.Vector3(wide ? -1.15 : 0, wide ? 1.0 : -1.0, g.z);
    this.camera.position.lerpVectors(mPos, runPos, ease);
    const look = new THREE.Vector3().lerpVectors(mLook, runLook, ease);
    if (this.shake > 0) { const k = this.shake * 0.28; this.camera.position.x += (Math.random() - 0.5) * k; this.camera.position.y += (Math.random() - 0.5) * k; }
    this.camera.fov = THREE.MathUtils.lerp(wide ? 38 : 40, cfg.fov, ease);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(look);
  }

  dispose(loseContext = false) {
    this.disposed = true;
    this.unsubscribe?.();
    this.world.dispose(); this.fx.dispose();
    this.sun.dispose();                                             // карта теней — отдельная текстура
    this.scene.traverse(o => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { x.map?.dispose?.(); x.dispose?.(); }); });
    this.scene.background?.dispose?.();
    this.renderer.dispose();
    if (loseContext) this.renderer.forceContextLoss?.();
  }
}
