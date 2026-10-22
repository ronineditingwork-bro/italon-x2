// Сцена Three.js: камера, свет, мир, робот, эффекты. Читает состояние игры и события, сама правил не знает.
import * as THREE from '../../vendor/three.module.js';
import { CONFIG, DERIVED } from '../config.js';
import { rowZ } from '../track.js';
import { createRobot } from './robot.js';
import { createWorld } from './world.js';
import { createFx } from './fx.js';
import { leafShadowTexture } from './textures.js';
import { RoomEnvironment } from '../../vendor/RoomEnvironment.js';
import { EffectComposer } from '../../vendor/EffectComposer.js';
import { RenderPass } from '../../vendor/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/UnrealBloomPass.js';
import { ShaderPass } from '../../vendor/ShaderPass.js';
import { OutputPass } from '../../vendor/OutputPass.js';

// Тёплая виньетка и лёгкий тон золотого часа — после свечения, до тонового отображения.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.34 }, warm: { value: 0.2 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; uniform float warm; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = (vUv - 0.5) * vec2(1.0, 0.92);
      float v = smoothstep(0.82, 0.2, length(d)); c.rgb *= mix(1.0 - strength, 1.0, v);
      c.rgb = mix(c.rgb, c.rgb * vec3(1.1, 1.0, 0.86), warm); gl_FragColor = c; }`,
};

export function webglSupported() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function skyTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const ctx = c.getContext('2d'), g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#6f9fd6'); g.addColorStop(0.5, '#bcd3e6'); g.addColorStop(1, '#f6dcb0');
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
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.12;
    r.shadowMap.enabled = this.q.shadows; r.shadowMap.type = THREE.PCFSoftShadowMap;

    const s = this.scene = new THREE.Scene();
    s.background = skyTexture();
    s.fog = new THREE.Fog(0xf2dcb8, 34, 100);

    this.camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 220);
    // окружение нужно для бликов на глянцевых плитах и корпусе робота
    const pmrem = new THREE.PMREMGenerator(r), envScene = new RoomEnvironment();
    this.envRT = pmrem.fromScene(envScene, 0.04); s.environment = this.envRT.texture;
    envScene.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); pmrem.dispose();

    s.add(new THREE.HemisphereLight(0xbcd2f5, 0xd9a86c, 0.95));
    const sun = this.sun = new THREE.DirectionalLight(0xffc88e, 4.0);   // низкое тёплое солнце
    sun.position.set(9, 12, -8);
    if (this.q.shadows) {
      sun.castShadow = true; sun.shadow.mapSize.set(this.q.shadowMap, this.q.shadowMap);
      const sc = sun.shadow.camera; sc.left = -22; sc.right = 22; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 80;
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    }
    s.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0xbcd2ff, 0.55); fill.position.set(-12, 8, 10); s.add(fill);

    // пятна света и тени листвы на покрытии (дёшево и сильно меняет картинку)
    const dapple = this.dapple = new THREE.Mesh(new THREE.PlaneGeometry(64, 64),
      new THREE.MeshBasicMaterial({ map: leafShadowTexture(), transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, toneMapped: true, fog: false }));
    dapple.material.map.repeat.set(5, 5);
    dapple.rotation.x = -Math.PI / 2; dapple.position.y = 0.06; dapple.renderOrder = 2; s.add(dapple);

    this.robot = createRobot(); s.add(this.robot.root);
    this.robot.root.traverse(o => { if (o.isMesh) o.castShadow = this.q.shadows; });
    this.fx = createFx(this.q.particles, (row, col, x, y, z) => this.landed(row, col, x, y, z)); s.add(this.fx.group);
    this.buildWorld();
    this.buildPost();

    this.unsubscribe = game.on(e => this.onEvent(e));
    this.resize();
    this._v = new THREE.Vector3(); this._look = new THREE.Vector3();
  }

  buildWorld() {
    if (this.world) { this.scene.remove(this.world.group); this.world.dispose(); }
    this.world = createWorld(this.game, this.q);
    this.scene.add(this.world.group);
    this.applyEnv();
    this.worldDirty = false;
    const laid = this.game.laid, cols = CONFIG.grid.columns;           // после смены качества на ходу возвращаем уже уложенные плитки
    for (let i = 0; i < laid.length; i++) if (laid[i]) this.world.placeTile((i / cols) | 0, i % cols);
  }

  /** Сила отражений окружения по материалам: плиты и корпус — заметнее, остальное — еле-еле. */
  applyEnv() {
    this.scene.traverse(o => {
      const m = o.material; if (!m) return;
      (Array.isArray(m) ? m : [m]).forEach(x => { if ('envMapIntensity' in x) x.envMapIntensity = x.userData.env ?? 0.25; });
    });
  }

  /** Свечение, виньетка и тоновая кривая. Только для «высокого» качества: на слабых устройствах рисуем напрямую. */
  buildPost() {
    if (!this.q.post) return;
    const c = this.composer = new EffectComposer(this.renderer);
    if (this.q.msaa) { c.renderTarget1.samples = this.q.msaa; c.renderTarget2.samples = this.q.msaa; }
    c.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.34, 0.75, 0.9);
    c.addPass(this.bloom);
    c.addPass(new ShaderPass(GradeShader));
    c.addPass(new OutputPass());
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
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); }
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
    const sb = this.blend, sx = THREE.MathUtils.lerp(-5, 9, sb), sz = THREE.MathUtils.lerp(9, -12, sb);   // в меню свет спереди — лицо освещено
    this.sun.position.set(g.x + sx, 12, g.z + sz); this.sun.target.position.set(g.x, 0, g.z - 4);
    // слой «листвы» стоит на месте в мире (шаг привязки = период текстуры), поэтому не «плавает»
    const period = 64 / 5;
    this.dapple.position.x = 0; this.dapple.position.z = Math.round((g.z - 8) / period) * period;
    this.dapple.material.map.offset.x = (this.time * 0.004) % 1;
    if (draw) { if (this.composer) this.composer.render(dt || 0.016); else this.renderer.render(this.scene, this.camera); }
  }

  placeCamera(dt, paused) {
    const g = this.game, cfg = this.aspect < 0.95 ? CONFIG.camera.portrait : CONFIG.camera.landscape;
    const target = g.phase === 'menu' ? 0 : 1;
    if (!paused) this.blend += (target - this.blend) * Math.min(1, dt * 2.4);
    const b = this.blend, ease = b * b * (3 - 2 * b);
    const cx = g.x * CONFIG.camera.follow;
    // игровая камера: сверху и сзади, видны путь впереди и результат позади
    const runPos = this._v.set(cx + cfg.side, cfg.height, g.z + cfg.back);
    const runLook = this._look.set(g.x * 0.7 + cfg.aimX, cfg.lookY, g.z - cfg.ahead);
    // камера меню: спереди, видны лицо и коробка
    const wide = this.aspect >= 0.95;
    const mPos = new THREE.Vector3(wide ? 0.5 : 0.9, wide ? 1.7 : 2.0, g.z + (wide ? 6.4 : 11.5));
    const mLook = new THREE.Vector3(wide ? -1.35 : 0, wide ? 1.25 : -0.6, g.z);
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
    this.composer?.dispose(); this.bloom?.dispose?.();
    this.envRT?.dispose(); this.scene.environment = null;
    this.scene.traverse(o => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { x.map?.dispose?.(); x.dispose?.(); }); });
    this.scene.background?.dispose?.();
    this.renderer.dispose();
    if (loseContext) this.renderer.forceContextLoss?.();
  }
}
