// Статичные декорации зон. Всё собирается в один набор геометрий с цветами вершин и склеивается в 2–3 меша.
import * as THREE from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { CONFIG, DERIVED } from '../config.js';
import { createRng } from '../rng.js';
import { LAYOUT } from './ground.js';
import { waterTexture } from './textures.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

class Batch {
  constructor() { this.parts = []; _e.order = 'YXZ'; }
  add(geo, color, x, y, z, { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, jitter = 0, noise = 0 } = {}) {
    const g = geo.clone();
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
    g.applyMatrix4(_m.compose(_p, _q, _s));
    _c.set(color);
    if (jitter) _c.offsetHSL(0, 0, (Math.random() - 0.5) * jitter);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    const pa = g.attributes.position;
    for (let i = 0; i < n; i++) {
      let k = 1;
      if (noise) {                                                   // мелкая «листва»: яркость по позиции вершины
        const px = pa.getX(i), py = pa.getY(i), pz = pa.getZ(i);
        k = 1 + noise * (Math.sin(px * 27 + pz * 17) + Math.sin(py * 31 + px * 13) + Math.sin(pz * 23 + py * 19)) / 3 + noise * 0.5 * Math.sin(py * 3.2 + 1) ;
      }
      col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (g.index) g.toNonIndexed && (this.parts.push(g.toNonIndexed())); else this.parts.push(g);
    g.dispose?.();
  }
  build(material) {
    const merged = mergeGeometries(this.parts.map(p => { p.deleteAttribute('uv'); return p; }), false);
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }
}

const G = {
  ballHi: new THREE.IcosahedronGeometry(0.5, 2),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 9),
  ball: new THREE.IcosahedronGeometry(0.5, 1),
  ball0: new THREE.IcosahedronGeometry(0.5, 0),
};

const GREENS = [0x3f7233, 0x4b8038, 0x3a6b30, 0x5a9040, 0x335f2c];
const BLOOMS = [0xf6f3ea, 0xf6f3ea, 0xf3dfe6, 0xf0c9d6, 0xb9a0d6, 0xffffff];

export function buildDecor(qualityDecor = 1) {
  const solid = new Batch(), glass = new Batch(), glow = new Batch();
  const rng = createRng(CONFIG.seed + 99);
  const detailHigh = qualityDecor >= 1;                          // на слабых устройствах кусты проще
  const keep = () => rng.next() < qualityDecor;                    // прореживание для слабых устройств
  const H = DERIVED.pathHalfWidth;
  const zoneLen = DERIVED.zoneLength;
  const rowsLen = zoneLen * CONFIG.zones.length;
  const zoneSpan = i => ({ from: -i * zoneLen, to: -(i + 1) * zoneLen });

  const B = (w, h, d, color, x, y, z, o) => solid.add(G.box, color, x, y + h / 2, z, { sx: w, sy: h, sz: d, ...o });
  const Cy = (r, h, color, x, y, z, o) => solid.add(G.cyl, color, x, y + h / 2, z, { sx: r * 2, sy: h, sz: r * 2, ...o });
  const Ball = (r, color, x, y, z, o) => solid.add(detailHigh ? G.ballHi : G.ball, color, x, y, z, { sx: r * 2, sy: r * 2, sz: r * 2, jitter: 0.1, noise: 0.28, ...o });
  const Gl = (w, h, d, color, x, y, z, o) => glass.add(G.box, color, x, y + h / 2, z, { sx: w, sy: h, sz: d, ...o });
  const Em = (w, h, d, color, x, y, z, o) => glow.add(G.box, color, x, y + h / 2, z, { sx: w, sy: h, sz: d, ...o });

  // ---------- отдельные предметы ----------
  const tree = (x, z, s = 1) => {
    Cy(0.13 * s, 1.7 * s, 0x6b4f35, x, 0, z);
    Cy(0.07 * s, 0.9 * s, 0x6b4f35, x + 0.25 * s, 1.3 * s, z, { rz: -0.6 });
    const leaf = GREENS[rng.int(0, GREENS.length - 1)], leaf2 = GREENS[rng.int(0, GREENS.length - 1)];
    Ball(1.0 * s, leaf, x, 2.5 * s, z); Ball(0.8 * s, leaf2, x + 0.7 * s, 2.9 * s, z - 0.3 * s); Ball(0.75 * s, leaf, x - 0.65 * s, 2.8 * s, z + 0.4 * s);
    Ball(0.7 * s, leaf2, x + 0.1 * s, 3.4 * s, z + 0.1 * s); Ball(0.6 * s, leaf, x - 0.3 * s, 3.0 * s, z - 0.7 * s); Ball(0.55 * s, leaf2, x + 0.5 * s, 2.3 * s, z + 0.7 * s);
  };
  /** Цветущий кустарник: тёмно-зелёная шапка и россыпь мелких цветков. */
  const flowerBush = (x, z, s = 1, flowers = true) => {
    const leaf = GREENS[rng.int(0, GREENS.length - 1)];
    Ball(0.5 * s, leaf, x, 0.34 * s, z, { sy: 0.8 * s }); Ball(0.4 * s, leaf, x + 0.42 * s, 0.28 * s, z + 0.12 * s); Ball(0.38 * s, leaf, x - 0.4 * s, 0.3 * s, z - 0.1 * s);
    if (!flowers || !keep()) return;
    const n = 26 + rng.int(0, 18), tone = BLOOMS[rng.int(0, BLOOMS.length - 1)];
    for (let i = 0; i < n; i++) {
      const a = rng.next() * Math.PI * 2, r = rng.next() * 0.5 * s, y = (0.28 + rng.next() * 0.36) * s;
      solid.add(G.ball0, rng.next() < 0.75 ? tone : 0xf6f3ea, x + Math.cos(a) * r, y, z + Math.sin(a) * r, { sx: 0.17, sy: 0.17, sz: 0.17 });
    }
  };
  const lowShrub = (x, z, s = 1) => { Ball(0.38 * s, GREENS[rng.int(0, GREENS.length - 1)], x, 0.26 * s, z, { sy: 0.9 }); Ball(0.3 * s, GREENS[rng.int(0, GREENS.length - 1)], x + 0.28 * s, 0.22 * s, z + 0.1); };
  const grass = (x, z) => { for (let i = 0; i < 4; i++) solid.add(G.cone, 0x9bb35a, x + (i - 1.5) * 0.06, 0.28, z + (i % 2) * 0.05, { sx: 0.09, sy: 0.56, sz: 0.09, rz: (i - 1.5) * 0.18 }); };
  const bollard = (x, z) => { Cy(0.09, 0.78, 0x2b2d31, x, 0, z); B(0.2, 0.1, 0.2, 0x2b2d31, x, 0.78, z); Em(0.14, 0.2, 0.14, 0xffe1a0, x, 0.88, z); B(0.22, 0.04, 0.22, 0x2b2d31, x, 1.08, z); };
  const streetLamp = (x, z, side) => {
    Cy(0.06, 3.0, 0x2b2d31, x, 0, z); Cy(0.14, 0.3, 0x2b2d31, x, 0, z);
    B(0.55, 0.07, 0.15, 0x2b2d31, x - side * 0.22, 3.0, z); Em(0.3, 0.09, 0.18, 0xffe9b8, x - side * 0.4, 2.93, z);
  };
  const postLamp = (x, z) => { Cy(0.07, 2.0, 0x2b2d31, x, 0, z); B(0.34, 0.06, 0.34, 0x2b2d31, x, 2.0, z); Em(0.26, 0.34, 0.26, 0xffdf9c, x, 2.06, z); B(0.4, 0.05, 0.4, 0x2b2d31, x, 2.4, z); };
  const bench = (x, z, ry = 0) => {
    B(1.5, 0.07, 0.42, 0xa07a52, x, 0.44, z, { ry }); B(1.5, 0.36, 0.06, 0xa07a52, x, 0.55, z - Math.cos(ry) * 0.2, { ry });
    B(0.08, 0.44, 0.42, 0x2b2d31, x + Math.cos(ry) * 0.62, 0, z - Math.sin(ry) * 0.62, { ry }); B(0.08, 0.44, 0.42, 0x2b2d31, x - Math.cos(ry) * 0.62, 0, z + Math.sin(ry) * 0.62, { ry });
  };
  const planterBig = (x, z, s = 1) => { Cy(0.55 * s, 0.7 * s, 0xcfc6b5, x, 0, z); Cy(0.5 * s, 0.05, 0x3a2f26, x, 0.7 * s, z); flowerBush(x, z, 0.95 * s); };
  const lounger = (x, z, ry = 0) => {
    const o = { ry }, L = (lx, lz) => [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)];
    B(0.78, 0.08, 1.9, 0x8b6a47, x, 0.26, z, o);
    for (const [lx, lz] of [[-0.34, -0.85], [0.34, -0.85], [-0.34, 0.85], [0.34, 0.85]]) { const [px, pz] = L(lx, lz); B(0.06, 0.26, 0.06, 0x8b6a47, px, 0, pz, o); }
    B(0.7, 0.12, 1.1, 0x8a8e96, x, 0.34, L(0, 0.35)[1], o);
    const [bx, bz] = L(0, -0.55); B(0.7, 0.12, 0.8, 0x8a8e96, bx, 0.42, bz, { ry, rx: -0.55 });
    const [tx, tz] = L(0, 0.2); B(0.5, 0.05, 0.5, 0xf1eee8, tx, 0.46, tz, o);                // полотенце
  };
  /** Машина: длина вдоль локальной оси Z, ry — поворот. */
  const car = (x, z, ry, color) => {
    const c = Math.cos(ry), s = Math.sin(ry), L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const o = { ry };
    B(1.78, 0.5, 4.2, color, x, 0.28, z, o);                                   // кузов
    B(1.7, 0.18, 4.3, 0x1f2124, x, 0.2, z, o);                                  // низ и бамперы
    const [cx, cz] = L(0, -0.1);
    B(1.55, 0.52, 2.15, color, cx, 0.78, cz, o);                                // салон
    Gl(1.58, 0.36, 1.95, 0x1a2530, cx, 0.86, cz, o); Gl(1.4, 0.32, 2.2, 0x1a2530, cx, 0.88, cz, o);
    B(1.45, 0.05, 1.7, color, cx, 1.3, cz, o);                                  // крыша
    for (const sx of [-1, 1]) for (const sz of [-1.4, 1.4]) {
      const [wx, wz] = L(sx * 0.9, sz);
      solid.add(G.cyl, 0x151618, wx, 0.34, wz, { sx: 0.68, sy: 0.3, sz: 0.68, rz: Math.PI / 2, ry });
      solid.add(G.cyl, 0xaeb2b8, L(sx * 1.0, sz)[0], 0.34, L(sx * 1.0, sz)[1], { sx: 0.36, sy: 0.08, sz: 0.36, rz: Math.PI / 2, ry });
    }
    for (const sx of [-1, 1]) {
      const [fx, fz] = L(sx * 0.6, 2.1); Em(0.34, 0.12, 0.05, 0xfff2cc, fx, 0.5, fz, o);
      const [rx, rz] = L(sx * 0.62, -2.1); Em(0.4, 0.1, 0.05, 0xff3030, rx, 0.62, rz, o);
    }
  };
  const house = (x, z, w, d, h, wall, side) => {                 // side: куда повёрнут фасад (по X)
    B(w, h, d, wall, x, 0, z);
    B(w + 0.7, 0.32, d + 0.7, 0x34373b, x, h, z);               // плоская крыша с карнизом
    B(w + 0.1, 0.3, d + 0.1, 0xb7b0a2, x, 0, z);                // цоколь
    const fx = x + side * (w / 2 + 0.03);
    Gl(0.06, h * 0.52, d * 0.5, 0x27465e, fx, h * 0.3, z - d * 0.1);   // панорамное окно
    B(0.12, h * 0.7, d * 0.25, 0xb88a5a, fx, 0, z + d * 0.33);          // деревянная вставка
    Gl(0.06, 1.4, 1.1, 0x27465e, fx, 1.9 * h / 3 + 0.1, z + d * 0.33);
    for (let i = 0; i < 6; i++) B(0.04, h * 0.5, 0.05, 0x2b2d31, fx + side * 0.03, h * 0.3, z - d * 0.1 - d * 0.25 + i * (d * 0.5 / 5));
  };
  const garage = (x, z, side) => {
    const fx = x + side * 0.02;
    B(0.25, 2.6, 4.4, 0x3d4045, fx, 0, z);
    for (let i = 0; i < 5; i++) B(0.3, 0.035, 4.2, 0x25272a, fx + side * 0.05, 0.5 + i * 0.5, z);
    B(0.3, 0.12, 4.8, 0xd8d1c3, fx + side * 0.04, 2.6, z);
  };

  // ---------- вдоль дорожки: клумбы, бордюры, фонарики ----------
  function bedRow(zl, zi, step = 1.7) {
    const z0 = zl.from, z1 = zl.to;
    for (const [side, sign] of [['left', -1], ['right', 1]]) {
      const bed = LAYOUT.zones[zi][side].find(s => s.kind === 'bed'); if (!bed) continue;
      const cx = sign * (bed.from + bed.to) / 2;
      let n = 0;
      for (let z = z0 - 1 - rng.next() * step; z > z1; z -= step * (0.8 + rng.next() * 0.7), n++) {
        const r = rng.next();
        if (r < 0.58) flowerBush(cx + (rng.next() - 0.5) * 0.6, z, 0.8 + rng.next() * 0.55);
        else if (r < 0.82) lowShrub(cx + (rng.next() - 0.5) * 0.7, z, 0.8 + rng.next() * 0.5);
        else grass(cx + (rng.next() - 0.5) * 0.8, z);
        if (n % 4 === 2) bollard(sign * (bed.from + 0.35), z - 0.3);
      }
    }
  }

  // ---------- ЗОНА 1: ПАРКОВКА ----------
  {
    const zl = { from: 46, to: -zoneLen }, zone = zoneSpan(0);
    const markY = -0.045, colors = [0x2c3a52, 0xb9bec4, 0x2f3033, 0x8c1f2a, 0xe4e6e8, 0x41505c, 0x6a6e73, 0x1f2a24];
    for (const sx of [-1, 1]) for (let z = 40; z > zone.to; z -= 3.2) {
      B(0.1, 0.012, 3.0, 0xe8e8e0, sx * 7.0, markY, z); B(0.1, 0.012, 3.0, 0xe8e8e0, sx * 10.5, markY, z); B(3.5, 0.012, 0.1, 0xe8e8e0, sx * 8.75, markY, z - 1.5);
    }
    for (let z = 38; z > zone.to + 4; z -= 6.4) for (const sx of [-1, 1]) if (rng.next() < 0.6) car(sx * 8.75, z - 1.6, Math.PI / 2, colors[rng.int(0, colors.length - 1)]);
    for (let z = 36; z > zone.to + 6; z -= 14) { if (keep()) tree(-15, z, 1.2); if (keep()) tree(15, z - 5, 1.2); }
    for (let z = 20; z > zone.to; z -= 36) { house(-23, z - 6, 8, 16, 7, 0xd9d2c4, 1); house(23, z - 6, 8, 16, 9, 0xc9c4ba, -1); }
    bedRow({ from: 44, to: zone.to }, 0, 1.55);
  }

  // ---------- ЗОНА 2: ПОДЪЕЗД К ДОМУ ----------
  {
    const zl = zoneSpan(1);
    house(-12.5, zl.from - 38, 9, 26, 6.2, 0xe8e0d2, 1);
    garage(-7.9, zl.from - 26, 1);
    B(0.4, 2.7, 0.4, 0xb88a5a, -7.7, 0, zl.from - 23); B(0.4, 2.7, 0.4, 0xb88a5a, -7.7, 0, zl.from - 29);
    B(2.6, 0.16, 3.6, 0xcfc8ba, -7.4, 0, zl.from - 47); B(2.2, 0.16, 3.2, 0xcfc8ba, -7.0, 0.16, zl.from - 47);        // входная группа
    Gl(0.08, 2.2, 1.1, 0x4b3322, -7.85, 0.3, zl.from - 47);
    house(10.5, zl.from - 52, 8, 20, 5.2, 0xd8d1c3, -1);
    B(0.55, 2.2, 0.55, 0x3a3d42, -H - 0.5, 0, zl.from - 8); B(0.55, 2.2, 0.55, 0x3a3d42, H + 0.5, 0, zl.from - 8);   // столбы ворот
    for (let z = zl.from - 4; z > zl.to + 4; z -= 7) { if (keep()) tree(-17, z - 3, 1.25); if (keep()) tree(16, z - 2, 1.3); }
    for (let z = zl.from - 6; z > zl.to + 4; z -= 12) planterBig(H + 4.8, z, 1);
    for (let z = zl.from - 2; z > zl.to; z -= 12) postLamp(-H - 0.9, z);
    bedRow(zl, 1, 1.6);
  }

  // ---------- ЗОНА 3: ТРОТУАР ----------
  {
    const zl = zoneSpan(2);
    for (let z = zl.from - 6; z > zl.to; z -= 15) { bench(-H - 1.9, z, Math.PI / 2); if (keep()) bench(H + 1.9, z - 7, -Math.PI / 2); }
    for (let z = zl.from - 4; z > zl.to; z -= 9) { planterBig(-H - 1.0, z, 0.9); if (keep()) planterBig(H + 1.0, z - 4, 0.9); }
    for (let z = zl.from - 7; z > zl.to; z -= 14) { if (keep()) tree(-13, z, 1.3); if (keep()) tree(13, z - 6, 1.25); if (keep()) tree(-H - 6.4, z - 3, 1.0); }
    for (let z = zl.from - 4; z > zl.to; z -= 40) { house(-22, z - 12, 8, 24, 11, 0xd7cdbd, 1); house(22, z - 12, 8, 24, 9, 0xe1dccf, -1); }
    for (let z = zl.from - 5; z > zl.to; z -= 11) { streetLamp(-H - 3.6, z, 1); if (rng.next() < 0.8) streetLamp(H + 3.6, z - 5, -1); }
    bedRow(zl, 2, 1.6);
  }

  // ---------- ЗОНА 4: У БАССЕЙНА ----------
  {
    const zl = zoneSpan(3), mid = (zl.from + zl.to) / 2;
    house(-14, zl.from - 40, 9, 30, 6.5, 0xe9e3d6, 1);
    B(11, 0.1, 24, 0xcdbfa9, -11.4, -0.03, zl.from - 40);                                      // терраса дома
    // бортик бассейна — плоский светлый
    B(0.7, 0.1, zoneLen - 12, 0xe6dfd2, H + 2.6 - 0.35, -0.03, mid); B(0.7, 0.1, zoneLen - 12, 0xe6dfd2, H + 12.4 + 0.35, -0.03, mid);
    B(10.6, 0.1, 0.7, 0xe6dfd2, H + 7.5, -0.03, zl.from - 6.35); B(10.6, 0.1, 0.7, 0xe6dfd2, H + 7.5, -0.03, zl.to + 6.35);
    // шезлонги и столики на террасе за бассейном
    for (let z = zl.from - 14; z > zl.to + 10; z -= 12) { lounger(H + 14.0, z, Math.PI / 2); lounger(H + 14.0, z - 2.1, Math.PI / 2); Cy(0.3, 0.45, 0x35383d, H + 13.6, 0, z - 1.05); }
    for (let z = zl.from - 10; z > zl.to + 8; z -= 16) { planterBig(H + 14.6, z, 1.1); }
    for (let z = zl.from - 8; z > zl.to; z -= 9) { if (keep()) tree(-18, z - 4, 1.25); if (keep()) tree(H + 19, z - 2, 1.3); }
    for (let z = zl.from - 3; z > zl.to; z -= 12) { postLamp(H + 1.3, z); if (rng.next() < 0.7) postLamp(-H - 1.3, z - 6); }
    bedRow(zl, 3, 1.6);
  }
  void rowsLen;

  const solidMesh = solid.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.0 }));
  const glassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.6 }); glassMat.userData.env = 1.1;
  const glassMesh = glass.build(glassMat); glassMesh.castShadow = false;
  const glowMesh = glow.build(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })); glowMesh.castShadow = glowMesh.receiveShadow = false;
  glowMesh.material.color.setScalar(1.7);                                                        // светятся ярче белого → цепляет свечение
  const group = new THREE.Group(); group.add(solidMesh, glassMesh, glowMesh);
  return group;
}

/** Вода бассейна: отдельная плоскость (анимируется цветом и смещением узора). */
export function buildPool() {
  const H = DERIVED.pathHalfWidth, zoneLen = DERIVED.zoneLength;
  const geo = new THREE.PlaneGeometry(9.8, zoneLen - 12, 1, 1);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 9.8 / 5, uv.getY(i) * (zoneLen - 12) / 5);
  const mat = new THREE.MeshStandardMaterial({ map: waterTexture(), color: 0xffffff, roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.92 });
  mat.userData.env = 1.2;
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(H + 7.5, -0.1, -(3 * zoneLen + zoneLen / 2));
  m.receiveShadow = true;
  return m;
}
