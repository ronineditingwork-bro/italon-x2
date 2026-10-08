// Статичные декорации зон. Всё собирается в один набор геометрий с цветами вершин и склеивается в 2–3 меша.
import * as THREE from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { CONFIG, DERIVED } from '../config.js';
import { createRng } from '../rng.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

class Batch {
  constructor() { this.parts = []; }
  add(geo, color, x, y, z, { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, jitter = 0 } = {}) {
    const g = geo.clone();
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
    g.applyMatrix4(_m.compose(_p, _q, _s));
    _c.set(color);
    if (jitter) _c.offsetHSL(0, 0, (Math.random() - 0.5) * jitter);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
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
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 9),
  ball: new THREE.IcosahedronGeometry(0.5, 1),
};

export function buildDecor(qualityDecor = 1) {
  const solid = new Batch(), glass = new Batch();
  const rng = createRng(CONFIG.seed + 99);
  const keep = () => rng.next() < qualityDecor;                    // прореживание для слабых устройств
  const H = DERIVED.pathHalfWidth;
  const total = DERIVED.rowsPerZone * CONFIG.zones.length * CONFIG.grid.tile;
  const zoneLen = DERIVED.zoneLength;
  const Z = (zoneIndex, off) => -(zoneIndex * zoneLen + off);

  const B = (w, h, d, color, x, y, z, o) => solid.add(G.box, color, x, y + h / 2, z, { sx: w, sy: h, sz: d, ...o });
  const Cy = (r, h, color, x, y, z, o) => solid.add(G.cyl, color, x, y + h / 2, z, { sx: r * 2, sy: h, sz: r * 2, ...o });
  const Ball = (r, color, x, y, z, o) => solid.add(G.ball, color, x, y, z, { sx: r * 2, sy: r * 2, sz: r * 2, jitter: 0.08, ...o });
  const Gl = (w, h, d, color, x, y, z, o) => glass.add(G.box, color, x, y + h / 2, z, { sx: w, sy: h, sz: d, ...o });

  // ---------- отдельные предметы ----------
  const tree = (x, z, s = 1) => {
    Cy(0.12 * s, 1.6 * s, 0x6b4f35, x, 0, z);
    const leaf = [0x4f8a3a, 0x5c9a42, 0x477c34][rng.int(0, 2)];
    Ball(0.95 * s, leaf, x, 2.1 * s, z); Ball(0.7 * s, leaf, x + 0.45 * s, 2.7 * s, z - 0.2 * s); Ball(0.65 * s, leaf, x - 0.4 * s, 2.55 * s, z + 0.3 * s);
  };
  const bush = (x, z, s = 1) => {
    const leaf = [0x5a9c47, 0x6aaa4f, 0x4a8a3b][rng.int(0, 2)];
    Ball(0.5 * s, leaf, x, 0.35 * s, z, { sy: 0.8 }); Ball(0.4 * s, leaf, x + 0.45 * s, 0.3 * s, z + 0.1);
    if (rng.next() < 0.5) Ball(0.1, [0xf2f2ee, 0xf3d4e2, 0xb99cd9][rng.int(0, 2)], x + 0.1, 0.62 * s, z + 0.2);
  };
  const hedge = (x, z, len, h = 0.9) => B(0.9, h, len, 0x4f8a3a, x, 0, z, { jitter: 0.05 });
  const lamp = (x, z, side) => {
    Cy(0.05, 2.5, 0x2c2f33, x, 0, z); B(0.5, 0.08, 0.14, 0x2c2f33, x - side * 0.2, 2.5, z);
    B(0.28, 0.1, 0.16, 0xfff0c0, x - side * 0.38, 2.44, z);
    Cy(0.12, 0.3, 0x2c2f33, x, 0, z);
  };
  const bench = (x, z, ry = 0) => {
    B(1.4, 0.07, 0.4, 0x9a7650, x, 0.42, z, { ry }); B(1.4, 0.35, 0.06, 0x9a7650, x, 0.55, z, { ry });
    B(0.08, 0.42, 0.4, 0x2c2f33, x + Math.cos(ry) * 0.6, 0, z - Math.sin(ry) * 0.6); B(0.08, 0.42, 0.4, 0x2c2f33, x - Math.cos(ry) * 0.6, 0, z + Math.sin(ry) * 0.6);
  };
  const car = (x, z, ry, color) => {
    const o = { ry };
    B(1.7, 0.5, 3.6, color, x, 0.28, z, o);
    const dx = Math.sin(ry) * 0.15, dz = Math.cos(ry) * 0.15;
    B(1.5, 0.5, 1.8, color, x - dx * 0, 0.78, z + dz * 0, o);
    Gl(1.52, 0.38, 1.7, 0x1c2a38, x, 0.8, z, o); Gl(1.4, 0.34, 1.88, 0x1c2a38, x, 0.8, z, o);
    for (const sx of [-1, 1]) for (const sz of [-1.2, 1.2]) {
      const wx = x + (sx * 0.86) * Math.cos(ry) + sz * Math.sin(ry), wz = z - (sx * 0.86) * Math.sin(ry) + sz * Math.cos(ry);
      solid.add(G.cyl, 0x17181a, wx, 0.3, wz, { sx: 0.6, sy: 0.3, sz: 0.6, rz: Math.PI / 2, ry });
    }
    for (const sx of [-1, 1]) B(0.3, 0.12, 0.06, 0xfff2c4, x + sx * 0.5 * Math.cos(ry) + Math.sin(ry) * 1.8, 0.5, z - sx * 0.5 * Math.sin(ry) + Math.cos(ry) * 1.8, o);
  };
  const house = (x, z, w, d, h, wall, side) => {                 // side: куда повёрнут фасад (по X)
    B(w, h, d, wall, x, 0, z);
    B(w + 0.6, 0.3, d + 0.6, 0x2f3236, x, h, z);               // плоская крыша с карнизом
    const fx = x + side * (w / 2 + 0.03);
    Gl(0.06, h * 0.52, d * 0.5, 0x27465e, fx, h * 0.3, z - d * 0.1);   // панорамное окно
    B(0.12, h * 0.7, d * 0.25, 0xb88a5a, fx, 0, z + d * 0.33);          // деревянная вставка
    Gl(0.06, 1.4, 1.1, 0x27465e, fx, 1.9 * h / 3 + 0.1, z + d * 0.33);
  };
  const garage = (x, z, side) => {
    const fx = x + side * 0.02;
    B(0.25, 2.5, 4.2, 0x3a3d42, fx, 0, z);
    for (let i = 0; i < 4; i++) B(0.3, 0.03, 4.0, 0x2a2c30, fx + side * 0.05, 0.55 + i * 0.55, z);
  };
  const planterBig = (x, z) => { B(1.1, 0.6, 1.1, 0xb7b2a6, x, 0, z); bush(x, z, 1.1); };

  const zoneSpan = (i) => ({ from: -i * zoneLen, to: -(i + 1) * zoneLen });

  // ---------- ЗОНА 1: ПАРКОВКА ----------
  {
    const zl = zoneSpan(0);
    B(26, 0.02, zoneLen, 0x55585d, -17, -0.1, (zl.from + zl.to) / 2);                          // асфальт слева
    B(26, 0.02, zoneLen, 0x55585d, 17, -0.1, (zl.from + zl.to) / 2);
    for (let z = -4; z > zl.to; z -= 3.2) {                                                      // разметка
      for (const sx of [-1, 1]) {
        B(0.1, 0.02, 3.0, 0xe8e8e0, sx * 7.0, -0.07, z); B(0.1, 0.02, 3.0, 0xe8e8e0, sx * 10.5, -0.07, z); B(3.5, 0.02, 0.1, 0xe8e8e0, sx * 8.75, -0.07, z - 1.5);
      }
    }
    const colors = [0x2c3a52, 0xb9bec4, 0x2f3033, 0x8c1f2a, 0xe4e6e8, 0x41505c, 0x6a6e73];
    for (let z = -6; z > zl.to + 4; z -= 6.4) {
      for (const sx of [-1, 1]) if (rng.next() < 0.55) car(sx * 8.75, z - 1.6, Math.PI / 2 * 0 + (sx > 0 ? 0 : 0) + Math.PI / 2, rng.pick(colors));
    }
    for (let z = -10; z > zl.to + 6; z -= 14) { bush(-5.4, z, 1.2); bush(5.4, z - 4, 1.2); if (keep()) tree(-13, z, 1.1); if (keep()) tree(13, z - 5, 1.1); }
    // фасад жилого дома вдали слева и справа
    for (let z = -10; z > zl.to; z -= 36) { house(-19, z - 6, 8, 16, 7, 0xd9d2c4, 1); house(19, z - 6, 8, 16, 9, 0xc9c4ba, -1); }
    B(26, 0.02, 44, 0x55585d, -17, -0.1, 22); B(26, 0.02, 44, 0x55585d, 17, -0.1, 22);
    for (let z = 4; z < 40; z += 3.2) for (const sx of [-1, 1]) { B(0.1, 0.02, 3.0, 0xe8e8e0, sx * 7.0, -0.07, z); B(0.1, 0.02, 3.0, 0xe8e8e0, sx * 10.5, -0.07, z); B(3.5, 0.02, 0.1, 0xe8e8e0, sx * 8.75, -0.07, z - 1.5); }
    for (let z = 6; z < 38; z += 6.4) for (const sx of [-1, 1]) if (rng.next() < 0.6) car(sx * 8.75, z - 1.6, Math.PI / 2, rng.pick(colors));
    house(-19, 20, 8, 16, 7, 0xd9d2c4, 1); house(19, 20, 8, 16, 9, 0xc9c4ba, -1);
    lampsAlong(zl, lamp);
  }

  // ---------- ЗОНА 2: ПОДЪЕЗД К ДОМУ ----------
  {
    const zl = zoneSpan(1);
    B(30, 0.02, zoneLen, 0x7d8a5e, -19, -0.1, (zl.from + zl.to) / 2);
    B(30, 0.02, zoneLen, 0x7d8a5e, 19, -0.1, (zl.from + zl.to) / 2);
    house(-11.5, zl.from - 38, 9, 26, 6.2, 0xe6e0d4, 1);
    garage(-6.95, zl.from - 26, 1);
    B(0.4, 2.6, 0.4, 0xb88a5a, -6.9, 0, zl.from - 23); B(0.4, 2.6, 0.4, 0xb88a5a, -6.9, 0, zl.from - 29);
    // входная группа
    B(2.6, 0.16, 3.6, 0xcfc8ba, -6.5, 0, zl.from - 47); B(2.2, 0.16, 3.2, 0xcfc8ba, -6.1, 0.16, zl.from - 47);
    Gl(0.08, 2.2, 1.1, 0x4b3322, -6.95, 0.3, zl.from - 47);
    house(9.5, zl.from - 52, 8, 20, 5.2, 0xd8d1c3, -1);
    // ворота
    B(0.5, 2.1, 0.5, 0x3a3d42, -H - 0.4, 0, zl.from - 8); B(0.5, 2.1, 0.5, 0x3a3d42, H + 0.4, 0, zl.from - 8);
    for (let z = -4; z > zl.to + 4; z -= 7) { hedge(-5.2, z - zl.from * 0, 5.5, 0.8); bush(5.5, z, 1.1); if (keep()) tree(-16, z - 3, 1.2); if (keep()) tree(15, z - 2, 1.3); }
    for (let z = zl.from - 5; z > zl.to + 4; z -= 7) { hedge(-5.2, z, 5.5, 0.8); bush(5.5, z - 2, 1.15); }
    lampsAlong(zl, lamp);
  }

  // ---------- ЗОНА 3: ТРОТУАР ----------
  {
    const zl = zoneSpan(2);
    B(30, 0.02, zoneLen, 0x8a9462, -19, -0.1, (zl.from + zl.to) / 2);
    B(30, 0.02, zoneLen, 0x8a9462, 19, -0.1, (zl.from + zl.to) / 2);
    B(0.5, 0.22, zoneLen, 0xb7b4ac, -H - 0.25, 0, (zl.from + zl.to) / 2); B(0.5, 0.22, zoneLen, 0xb7b4ac, H + 0.25, 0, (zl.from + zl.to) / 2);   // бордюры
    for (let z = zl.from - 6; z > zl.to; z -= 15) { bench(-H - 1.8, z, Math.PI / 2); if (keep()) bench(H + 1.8, z - 7, -Math.PI / 2); }
    for (let z = zl.from - 4; z > zl.to; z -= 9) { B(2.2, 0.35, 1.0, 0x8a7b68, -H - 2.6, 0, z); bush(-H - 2.6, z, 0.9); if (keep()) { B(2.2, 0.35, 1.0, 0x8a7b68, H + 2.6, 0, z - 4); bush(H + 2.6, z - 4, 0.9); } }
    for (let z = zl.from - 7; z > zl.to; z -= 14) { if (keep()) tree(-12, z, 1.25); if (keep()) tree(12, z - 6, 1.2); }
    for (let z = zl.from - 4; z > zl.to; z -= 40) { house(-20, z - 12, 8, 24, 11, 0xd7cdbd, 1); house(20, z - 12, 8, 24, 9, 0xe1dccf, -1); }
    lampsAlong(zl, lamp, 9);
  }

  // ---------- ЗОНА 4: У БАССЕЙНА ----------
  {
    const zl = zoneSpan(3);
    B(30, 0.02, zoneLen, 0x7f9a5c, -19, -0.1, (zl.from + zl.to) / 2);
    B(1.8, 0.02, zoneLen, 0xcdbfa9, H + 0.9, -0.1, (zl.from + zl.to) / 2);                     // узкая терраса справа от дорожки
    B(18, 0.02, zoneLen, 0x7f9a5c, H + 21.9, -0.1, (zl.from + zl.to) / 2);                      // газон за бассейном
    B(10.8, 0.02, 6, 0xcdbfa9, H + 7.5, -0.1, zl.to + 3); B(10.8, 0.02, 6, 0xcdbfa9, H + 7.5, zl.from - 3);   // обход бассейна по торцам
    B(0.7, 0.35, zoneLen - 12, 0xe0d9cc, H + 2.15, 0, (zl.from + zl.to) / 2);                    // бортик бассейна у дорожки
    B(0.7, 0.35, zoneLen - 12, 0xe0d9cc, H + 12.85, 0, (zl.from + zl.to) / 2);
    // дом слева
    house(-13, zl.from - 40, 9, 30, 6.5, 0xe9e3d6, 1);
    B(9, 0.12, 22, 0xcdbfa9, -10.5, -0.02, zl.from - 40);                                       // терраса дома
    for (let z = zl.from - 8; z > zl.to; z -= 9) { hedge(-H - 2.2, z, 5, 0.85); if (keep()) tree(-17, z - 4, 1.2); }
    lampsAlong(zl, lamp, 12);
  }

  const solidMesh = solid.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.0 }));
  const glassMesh = glass.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.5 }));
  glassMesh.castShadow = false;
  const group = new THREE.Group(); group.add(solidMesh, glassMesh);
  return group;

  function lampsAlong(zl, fn, step = 11) {
    for (let z = zl.from - 5; z > zl.to; z -= step) { fn(-H - 1.1, z, 1); if (rng.next() < 0.75) fn(H + 1.1, z - step / 2, -1); }
  }
}

/** Вода бассейна: отдельная плоскость (анимируется цветом/смещением). */
export function buildPool() {
  const H = DERIVED.pathHalfWidth, zoneLen = DERIVED.zoneLength;
  const geo = new THREE.PlaneGeometry(10, zoneLen - 12, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x35b6c9, roughness: 0.12, metalness: 0.25, transparent: true, opacity: 0.88 });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(H + 7.5, -0.115, -(3 * zoneLen + zoneLen / 2));
  m.receiveShadow = true;
  return m;
}
