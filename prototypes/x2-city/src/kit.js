// Набор 3D-деталей игры: робот X2, помощник, «брак», техника, город, эффекты. Всё из примитивов, без моделей.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
export { THREE };

export const rnd = (a, b = 0) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05, ...o });
const E = (c, i = 1.1) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.4 });
export const MAT = {
  shell: M('#f1ebde', { roughness: 0.38 }), shellD: M('#a9a498'), dark: M('#191b22', { roughness: 0.35, metalness: 0.4 }), orange: M('#f08a24', { roughness: 0.4, emissive: '#7a3a05', emissiveIntensity: 0.5 }),
  kraft: M('#c79a5e', { roughness: 0.9 }), glass: M('#0d1626', { roughness: 0.08, metalness: 0.7 }), eye: E('#7fe9ff', 1.0), red: E('#ff4a2a', 1.4), warm: E('#ffc988', 0.8), white: E('#fff4e0', 0.8),
  slab: M('#3d4150', { roughness: 0.9 }), steel: M('#2a2f3d', { metalness: 0.7, roughness: 0.4 }), yellow: M('#d9a21a', { roughness: 0.6 }), rubber: M('#0c0d11', { roughness: 0.95 }), rust: M('#6b4130', { roughness: 0.95 }),
  asphalt: M('#161a26', { roughness: 0.32, metalness: 0.45 }), concrete: M('#3a4056', { roughness: 0.85 }), hat: M('#ffb21e', { roughness: 0.35, emissive: '#6a3d00', emissiveIntensity: 0.4 }), leaf: M('#3f8a45', { roughness: 0.9 }), leafD: M('#14262a', { roughness: 0.9 }), wood: M('#4a3626', { roughness: 0.9 }),
};
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d), C = (r1, r2, h, s = 18) => new THREE.CylinderGeometry(r1, r2, h, s), S = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h), RB = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 4, r);
export function add(p, g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; p.add(o); return o; }
export { B, C, S, RB, M, E };

// ---------- текстуры ----------
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t; }
export const glowTex = canvasTex(128, 128, (x) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); });
export const smokeTex = canvasTex(128, 128, (x) => { for (let i = 0; i < 14; i++) { const px = 30 + Math.random() * 68, py = 30 + Math.random() * 68, r = 18 + Math.random() * 26, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); } });
export function glow(p, color, size, x, y, z, op = 1) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: Math.min(0.75, op * 0.2) })); s.scale.set(size, size, 1); s.position.set(x, y, z); p.add(s); return s; }
export function smoke(p, color, size, x, y, z, op = 0.55) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color, depthWrite: false, transparent: true, opacity: op, rotation: Math.random() * 6 })); s.scale.set(size, size, 1); s.position.set(x, y, z); p.add(s); return s; }
const x2Tex = canvasTex(128, 128, (x) => { x.fillStyle = '#c79a5e'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#e9d9b8'; x.fillRect(52, 0, 22, 128); x.save(); x.translate(64, 64); x.rotate(Math.PI / 4); x.fillStyle = '#15171c'; x.fillRect(-34, -34, 68, 68); x.restore(); x.fillStyle = '#fff'; x.font = '800 38px Arial'; x.textAlign = 'center'; x.fillText('X2', 64, 78); });
const X2MAT = new THREE.MeshStandardMaterial({ map: x2Tex, roughness: 0.9 });
const winTex = lit => canvasTex(128, 256, (x) => { x.fillStyle = '#0a0d1a'; x.fillRect(0, 0, 128, 256); for (let r = 0; r < 16; r++) for (let q = 0; q < 8; q++) { const v = Math.random(); x.fillStyle = v < lit ? (Math.random() < 0.2 ? '#9fc4e8' : '#f2b872') : '#04060d'; x.fillRect(4 + q * 15.500, 4 + r * 15.800, 8, 9); } });
const WIN = [winTex(0.05), winTex(0.32)];
export function building(p, w, h, d, x, z, lit = 0, tint = '#1a2140') {
  const t = WIN[lit].clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, Math.round(w / 5)), Math.max(1, Math.round(h / 9)));
  const m = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.8, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.9 });
  const o = add(p, B(w, h, d), m, x, h / 2, z); add(p, B(w + 0.6, 0.5, d + 0.6), MAT.concrete, x, h + 0.25, z); return o;
}
export function tileMats(img, n = 4) {
  return Array.from({ length: n }, (_, i) => { const t = canvasTex(256, 256, (x) => { const s = Math.min(img.width, img.height) * 0.5; x.drawImage(img, (i % 2) * s * 0.9, ((i >> 1) % 2) * s * 0.9, s, s, 0, 0, 256, 256); x.strokeStyle = 'rgba(40,30,20,.55)'; x.lineWidth = 5; x.strokeRect(0, 0, 256, 256); x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 2; x.strokeRect(4, 4, 248, 248); });
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.42, metalness: 0.05, color: '#c9c6c0', emissive: '#fff1d6', emissiveMap: t, emissiveIntensity: 0.05 }); });
}

// ---------- персонажи ----------
/** Робот X2, смотрит в +X. Высота ~2.5. Поза задаётся каждый кадр: g.userData.pose({ ph, run, air, crouch, aim, hurt, t }). */
export function makeX2(tm) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const legf = (z, m) => { const hip = new THREE.Group(); hip.position.set(0, 0.98, z); g.add(hip); add(hip, C(0.1, 0.085, 0.5), m, 0, -0.25, 0); add(hip, C(0.12, 0.12, 0.1), MAT.orange, 0, 0, 0, Math.PI / 2);
    const knee = new THREE.Group(); knee.position.y = -0.5; hip.add(knee); add(knee, C(0.1, 0.1, 0.12), MAT.orange, 0, 0, 0, Math.PI / 2); add(knee, C(0.075, 0.06, 0.46), MAT.dark, 0, -0.24, 0); add(knee, RB(0.42, 0.14, 0.22, 0.05), m, 0.1, -0.5, 0); add(knee, B(0.42, 0.04, 0.22), MAT.orange, 0.1, -0.57, 0); return { hip, knee }; };
  const legs = [legf(0.17, MAT.shell), legf(-0.17, MAT.shellD)];
  add(body, RB(0.42, 0.2, 0.46, 0.06), MAT.dark, 0, 0.98, 0);
  add(body, C(0.3, 0.26, 0.56, 24), MAT.shell, 0, 1.36, 0); add(body, S(0.3), MAT.shell, 0, 1.64, 0).scale.y = 0.5; add(body, C(0.305, 0.3, 0.07, 24), MAT.orange, 0, 1.1, 0);
  add(body, RB(0.06, 0.2, 0.24, 0.02), MAT.dark, 0.29, 1.44, 0); add(body, B(0.02, 0.03, 0.16), MAT.eye, 0.325, 1.5, 0); add(body, S(0.022), MAT.orange, 0.325, 1.41, -0.05);
  add(body, C(0.09, 0.09, 0.14), MAT.dark, 0, 1.78, 0);
  const head = new THREE.Group(); head.position.set(0.06, 2.1, 0); body.add(head);
  add(head, RB(0.76, 0.58, 0.68, 0.2), MAT.shell); add(head, RB(0.16, 0.34, 0.54, 0.07), MAT.glass, 0.33, 0, 0);
  const eyes = [-0.12, 0.12].map(z => add(head, RB(0.03, 0.17, 0.11, 0.012), MAT.eye, 0.415, 0.01, z));
  for (const z of [-0.36, 0.36]) { add(head, C(0.15, 0.15, 0.06, 20), MAT.dark, -0.04, 0, z, Math.PI / 2); add(head, C(0.1, 0.1, 0.08, 20), MAT.orange, -0.04, 0, z, Math.PI / 2); }
  add(head, C(0.012, 0.012, 0.36), MAT.dark, -0.2, 0.46, 0.12); add(head, S(0.04), MAT.red, -0.2, 0.65, 0.12);
  add(head, RB(0.16, 0.1, 0.14, 0.03), MAT.dark, 0.26, 0.33, 0.2); add(head, B(0.02, 0.07, 0.1), MAT.white, 0.345, 0.33, 0.2);
  add(body, B(0.05, 0.9, 0.05), MAT.dark, -0.36, 1.45, 0.25); add(body, B(0.05, 0.9, 0.05), MAT.dark, -0.36, 1.45, -0.25);
  add(body, B(0.44, 0.56, 0.6), [MAT.kraft, X2MAT, MAT.kraft, MAT.kraft, X2MAT, X2MAT], -0.6, 1.32, 0);
  for (let i = 0; i < 5; i++) add(body, B(0.56, 0.055, 0.66), tm[i % tm.length], -0.6 + (i % 2) * 0.03, 1.66 + i * 0.075, 0);
  const scarf = []; for (let i = 0; i < 7; i++) scarf.push(add(body, B(0.2, 0.012, 0.13 - i * 0.008), MAT.orange, -0.3 - i * 0.17, 1.86, 0.3));
  add(body, S(0.1), MAT.orange, 0.04, 1.6, 0.35); add(body, C(0.07, 0.065, 0.34), MAT.shell, 0.14, 1.44, 0.38, 0, 0, 0.6);
  const gun = new THREE.Group(); gun.position.set(0.28, 1.3, 0.4); body.add(gun);
  add(gun, C(0.12, 0.12, 0.74, 8), MAT.dark, 0.36, 0, 0, 0, 0, Math.PI / 2); add(gun, C(0.13, 0.13, 0.07, 8), MAT.orange, 0.46, 0, 0, 0, 0, Math.PI / 2); add(gun, B(0.14, 0.05, 0.2), tm[0], 0.78, 0, 0);
  add(body, S(0.09), MAT.orange, 0.04, 1.6, -0.35); const armB = new THREE.Group(); armB.position.set(0.04, 1.6, -0.38); body.add(armB); add(armB, C(0.065, 0.06, 0.5), MAT.shellD, 0, -0.25, 0);
  g.userData.pose = (o) => {
    const run = o.run && !o.air, ph = o.ph, drop = o.crouch ? 0.42 : 0, bob = run ? Math.abs(Math.cos(ph)) * 0.07 : (o.air ? 0 : Math.sin(o.t * 2.4) * 0.012);
    body.position.y = bob - drop; body.rotation.z = (run ? -0.15 : 0) - (o.crouch ? 0.22 : 0) + (o.air ? (o.vy < 0 ? -0.08 : 0.1) : 0) + (o.hurt || 0) * 0.5;
    legs.forEach((l, i) => { const p = i * Math.PI; l.hip.position.y = 0.98 + bob - drop;
      l.hip.rotation.z = o.crouch ? 1.15 - i * 0.2 : o.air ? (i ? -0.45 : 0.75) : run ? Math.sin(ph + p) * 0.95 : (i ? -0.06 : 0.08);
      l.knee.rotation.z = -(o.crouch ? 2.1 : o.air ? (i ? 0.5 : 1.15) : run ? 0.3 + Math.max(0, Math.cos(ph + p)) * 1.15 : 0.06); });
    gun.rotation.z = o.aim || 0; head.rotation.z = (run ? 0.1 : 0) + (o.aim || 0) * 0.3; armB.rotation.z = run ? Math.sin(ph) * 0.9 : o.air ? 0.9 : 0.05;
    const bl = o.blink ? 0.15 : 1; eyes[0].scale.y = eyes[1].scale.y = bl;
    scarf.forEach((s, i) => { const w = Math.sin(i * 0.9 - o.t * (run || o.air ? 11 : 3)); s.position.y = 1.86 + w * 0.03 * (1 + i * 0.5) + i * (run || o.air ? 0.035 : -0.07); s.rotation.z = w * 0.4; });
  };
  g.userData.pose({ ph: 0, run: false, air: false, t: 0 });
  return g;
}

/** Помощник-укладчик, смотрит в +X. Высота ~1.2 с плитой. g.userData.pose(ph, run, air). */
export function makeHelper(tm, seed = 0, carry = true) {
  const g = new THREE.Group(), b = new THREE.Group(); g.add(b);
  const legs = [-0.12, 0.12].map(z => { const l = new THREE.Group(); l.position.set(0, 0.28, z); g.add(l); add(l, C(0.045, 0.04, 0.24), MAT.dark, 0, -0.12, 0); add(l, RB(0.2, 0.07, 0.12, 0.03), MAT.orange, 0.04, -0.25, 0); return l; });
  add(b, RB(0.52, 0.5, 0.48, 0.13), MAT.shell, 0, 0.52, 0); add(b, B(0.525, 0.05, 0.485), MAT.orange, 0, 0.33, 0);
  add(b, S(0.16), MAT.dark, 0.2, 0.56, 0).scale.x = 0.6; add(b, S(0.11), MAT.eye, 0.26, 0.56, 0).scale.x = 0.5; add(b, S(0.045), MAT.glass, 0.31, 0.56, 0.02);
  add(b, new THREE.SphereGeometry(0.3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.hat, 0, 0.74, 0).scale.y = 0.65; add(b, C(0.35, 0.35, 0.035, 22), MAT.hat, 0.03, 0.75, 0); add(b, B(0.05, 0.06, 0.08), MAT.white, 0.27, 0.84, 0);
  let slab = null; if (carry) { for (const z of [-0.27, 0.27]) add(b, C(0.03, 0.03, 0.42), MAT.dark, 0, 0.9, z); slab = add(b, B(0.84, 0.07, 0.62), tm[seed % tm.length], 0, 1.14, 0); }
  g.userData.pose = (ph, run, air) => { const s = run && !air ? Math.sin(ph) : 0; legs[0].rotation.z = air ? 0.6 : s * 0.85; legs[1].rotation.z = air ? -0.5 : -s * 0.85; b.position.y = run && !air ? Math.abs(s) * 0.06 : 0; b.rotation.z = run ? -0.1 : 0; if (slab) slab.rotation.z = s * 0.06; };
  return g;
}

/** «Брак»: ожившая треснувшая плита на арматуре, смотрит в −X. */
export function makeBrak(seed = 0, s = 1) {
  const g = new THREE.Group(), sh = new THREE.Shape(); [[-26, -36], [-30, -74], [-18, -98], [-4, -90], [6, -104], [26, -92], [30, -58], [22, -30], [4, -38], [-8, -28]].forEach((p, i) => { const x = p[0] / 55 + (rnd(seed, i) - 0.5) * 0.12, y = -p[1] / 55; i ? sh.lineTo(x, y) : sh.moveTo(x, y); });
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.34, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 }); geo.translate(0, 0, -0.17);
  const body = add(g, geo, MAT.slab, 0, 0.1, 0, 0, Math.PI / 2 + 0.5); body.rotation.z = (rnd(seed, 9) - 0.5) * 0.2;
  for (const z of [-0.2, 0.2]) { add(g, C(0.035, 0.035, 0.7, 6), MAT.rust, 0, 0.36, z, 0, 0, (rnd(seed, z > 0 ? 3 : 4) - 0.5) * 0.9); }
  for (const z of [-0.16, 0.2]) add(g, B(0.05, 0.05, 0.2), MAT.red, -0.24, 1.3, z, 0.4 * Math.sign(z), 0.5, 0);
  add(g, B(0.05, 0.04, 0.34), MAT.red, -0.24, 1.05, 0.02, 0, 0.5, 0);
  glow(g, '#ff4020', 2.2, -0.3, 1.2, 0, 0.55); g.scale.setScalar(s); return g;
}

// ---------- техника ----------
function hazard() { return new THREE.MeshStandardMaterial({ map: canvasTex(128, 32, (x) => { x.fillStyle = '#e0a81c'; x.fillRect(0, 0, 128, 32); x.fillStyle = '#14151a'; for (let i = -2; i < 8; i++) { x.beginPath(); x.moveTo(i * 24, 32); x.lineTo(i * 24 + 12, 32); x.lineTo(i * 24 + 44, 0); x.lineTo(i * 24 + 32, 0); x.fill(); } }), roughness: 0.7 }); }
const HAZ = hazard();
/** Гигантский асфальтоукладчик, смотрит в +X. Длина ~12, высота ~7. */
export function makePaver() {
  const g = new THREE.Group();
  for (const z of [-2.3, 2.3]) { add(g, RB(10, 1.7, 1.2, 0.5), MAT.rubber, 0, 0.85, z); for (let i = 0; i < 6; i++) add(g, C(0.62, 0.62, 1.3, 14), MAT.steel, -4 + i * 1.6, 0.85, z, Math.PI / 2); }
  add(g, B(10.4, 2.4, 4.2), MAT.yellow, 0, 2.7, 0); add(g, B(10.5, 0.5, 4.3), HAZ, 0, 1.75, 0);
  add(g, B(3.6, 2.4, 3.6), MAT.steel, -1.6, 5.1, 0); for (const z of [-1.82, 1.82]) add(g, B(2.8, 1.2, 0.05), MAT.red, -1.6, 5.4, z); add(g, B(0.05, 1.2, 2.8), MAT.red, 0.22, 5.4, 0);
  add(g, B(4.4, 0.25, 4.2), MAT.yellow, -1.6, 6.4, 0);
  add(g, C(0.32, 0.32, 3, 10), MAT.steel, -4, 6.2, 1.2); add(g, C(0.42, 0.32, 0.5, 10), MAT.rust, -4, 7.9, 1.2);
  // бункер с зубьями впереди
  add(g, B(2.6, 2.6, 5), MAT.steel, 5.6, 2.1, 0, 0, 0, -0.25); for (let i = 0; i < 7; i++) add(g, new THREE.ConeGeometry(0.3, 1.1, 4), MAT.rust, 7.25, 0.9, -2.1 + i * 0.7, 0, 0, -Math.PI / 2 - 0.2);
  for (const z of [-1.6, 1.6]) { add(g, C(0.42, 0.42, 0.3, 14), MAT.white, 5.25, 3.9, z, 0, 0, Math.PI / 2); glow(g, '#fff0d0', 3.2, 5.6, 3.9, z, 1.8); }
  for (let i = 0; i < 7; i++) smoke(g, '#3a3f58', 2 + i * 1.1, -4 - i * 0.9, 8.5 + i * 1.3, 1.2, 0.5 - i * 0.05);
  return g;
}
/** Гигантский дорожный каток, смотрит в −X. */
export function makeRoller() {
  const g = new THREE.Group();
  add(g, C(3, 3, 7.2, 32), MAT.steel, -4.5, 3, 0, Math.PI / 2); for (let i = 0; i < 12; i++) add(g, B(0.25, 0.25, 7.3), MAT.rust, -4.5 + Math.cos(i / 12 * 6.283) * 3, 3 + Math.sin(i / 12 * 6.283) * 3, 0);
  add(g, B(1, 4.5, 8), MAT.yellow, -4.5, 5, 0).scale.set(1, 0.25, 1); add(g, B(8, 3, 5.6), MAT.yellow, 2, 4.3, 0); add(g, B(8.1, 0.6, 5.7), HAZ, 2, 3, 0);
  for (const z of [-3.2, 3.2]) { add(g, B(7, 0.7, 0.5), MAT.yellow, -1.5, 3.4, z); add(g, C(2.3, 2.3, 1.4, 22), MAT.rubber, 4.2, 2.3, z * 0.95, Math.PI / 2); add(g, C(1, 1, 1.5, 14), MAT.steel, 4.2, 2.3, z * 0.95, Math.PI / 2); }
  add(g, B(3.8, 3, 4.4), MAT.steel, 2.6, 7.3, 0); add(g, B(0.06, 1.6, 3.6), MAT.red, 0.68, 7.6, 0); for (const z of [-2.22, 2.22]) add(g, B(3, 1.6, 0.05), MAT.red, 2.6, 7.6, z);
  add(g, B(4.6, 0.3, 5), MAT.yellow, 2.6, 8.9, 0); add(g, C(0.3, 0.3, 3.4, 10), MAT.steel, 5.2, 8.2, -1.5);
  for (const z of [-2, 2]) { add(g, C(0.5, 0.5, 0.3, 14), MAT.red, -2.05, 5, z, 0, 0, Math.PI / 2); glow(g, '#ff5030', 4, -2.4, 5, z, 1.8); }
  for (let i = 0; i < 7; i++) smoke(g, '#2a2c3c', 2.5 + i * 1.2, 5.2 + i * 0.8, 10.5 + i * 1.4, -1.5, 0.55 - i * 0.06);
  return g;
}
/** Экскаватор-силуэт (финальный босс вдали), смотрит на камеру. */
export function makeExcavator() {
  const g = new THREE.Group(), m = M('#0b0c16', { roughness: 1 });
  add(g, B(11, 2.4, 9), m, 0, 1.2, 0); add(g, B(8, 4, 7), m, 0, 4.4, 0); add(g, B(3.4, 3.4, 3.4), m, -2, 7.6, 1);
  add(g, B(1.6, 15, 1.6), m, 3, 12, 0, 0, 0, -0.5); add(g, B(1.3, 12, 1.3), m, 9.5, 14.5, 0, 0, 0, 0.9); add(g, B(4, 3.4, 3.6), m, 13.6, 9, 0, 0, 0, 0.3);
  for (const x of [-2.9, -1.1]) { add(g, B(1.1, 0.9, 0.1), MAT.red, x, 8, 2.75); } glow(g, '#ff5030', 12, -2, 8, 3.2, 0.9);
  return g;
}

// ---------- окружение и эффекты ----------
export function lamp(p, x, z, lit, sc, light = true, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; p.add(g);
  add(g, C(0.09, 0.12, 5.4, 8), MAT.steel, 0, 2.7, 0); add(g, B(1.4, 0.09, 0.09), MAT.steel, 0.65, 5.4, 0); add(g, RB(0.7, 0.14, 0.3, 0.05), lit ? MAT.warm : MAT.dark, 1.2, 5.32, 0);
  if (lit) { glow(g, '#ffc988', 2.4, 1.2, 5.2, 0, 1.6); if (light) { const l = new THREE.PointLight('#ffb878', 0.55, 13, 2); l.position.set(1.2, 4.8, 0); g.add(l); } }
  return g;
}
export function garland(p, x0, x1, y, z, lit) { for (let i = 0; i <= 14; i++) { const u = i / 14, x = x0 + (x1 - x0) * u, yy = y - Math.sin(u * Math.PI) * 0.8; add(p, S(0.07, 8, 6), lit ? MAT.warm : MAT.dark, x, yy, z); if (lit && i % 2 === 0) glow(p, '#ffd9a0', 0.9, x, yy, z, 0.8); } }
export function car(p, x, z, ry = 0, col = '#232a44') { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; p.add(g); const m = M(col, { roughness: 0.3, metalness: 0.6 }); add(g, RB(4, 0.8, 1.8, 0.25), m, 0, 0.65, 0); add(g, RB(2.2, 0.7, 1.6, 0.25), MAT.glass, -0.1, 1.25, 0); for (const [wx, wz] of [[-1.3, 0.9], [1.3, 0.9], [-1.3, -0.9], [1.3, -0.9]]) add(g, C(0.36, 0.36, 0.25, 14), MAT.rubber, wx, 0.36, wz, Math.PI / 2); return g; }
export function tree(p, x, z, alive) { add(p, C(0.14, 0.2, 2.4, 7), MAT.wood, x, 1.2, z); const m = alive ? MAT.leaf : MAT.leafD; add(p, new THREE.IcosahedronGeometry(1.5, 1), m, x, 3.3, z); add(p, new THREE.IcosahedronGeometry(1.05, 1), m, x + 0.8, 2.7, z + 0.3); add(p, new THREE.IcosahedronGeometry(1, 1), m, x - 0.8, 2.8, z - 0.2); }
export function barrier(p, x, z, ry = 0) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; p.add(g); add(g, B(2.4, 0.9, 0.5), MAT.concrete, 0, 0.45, 0); add(g, B(2.42, 0.25, 0.52), HAZ, 0, 0.75, 0); return g; }
export function explosion(p, x, y, z, s = 1, seed = 1) {
  for (let i = 0; i < 9; i++) glow(p, i % 3 ? '#ff6a10' : '#ffe9a0', s * (2.2 + rnd(seed, i) * 2.6), x + (rnd(seed, i + 10) - 0.5) * 2.4 * s, y + (rnd(seed, i + 20) - 0.3) * 2.2 * s, z + (rnd(seed, i + 30) - 0.5) * 1.5 * s, 2.6);
  for (let i = 0; i < 6; i++) smoke(p, '#1c1d28', s * (3 + rnd(seed, i + 40) * 3), x + (rnd(seed, i + 50) - 0.5) * 3 * s, y + 1.5 * s + rnd(seed, i + 60) * 3.2 * s, z - 0.3, 0.6);
  for (let i = 0; i < 16; i++) { const a = rnd(seed, i + 70) * 6.283, r = (1.5 + rnd(seed, i + 80) * 3.5) * s; add(p, B(0.1 + rnd(seed, i + 90) * 0.35, 0.08 + rnd(seed, i + 91) * 0.2, 0.2), i % 3 ? MAT.concrete : MAT.warm, x + Math.cos(a) * r, y + Math.abs(Math.sin(a)) * r * 0.9, z + (rnd(seed, i + 95) - 0.5) * 3 * s, a, a * 2, a * 3); }
  const l = new THREE.PointLight('#ff8a30', 0.9 * s, 14 * s, 2); l.position.set(x, y + 1, z + 1); p.add(l);
}
/** Летящая плита-снаряд со светящимся следом. */
export function tracer(p, tm, x, y, z, dx, dy, dz, len = 1.6) { const g = new THREE.Group(); g.position.set(x, y, z); g.lookAt(x + dx, y + dy, z + dz); p.add(g); add(g, B(0.34, 0.07, 0.34), tm[0]); add(g, B(0.1, 0.03, len), MAT.warm, 0, 0, -len / 2 - 0.2); glow(g, '#ffe2a0', 1, 0, 0, 0, 1.6); return g; }
export function sparks(p, x, y, z, n, spread, color = '#ffd27a', seed = 3) { const pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos[i * 3] = x + (rnd(seed, i) - 0.5) * spread; pos[i * 3 + 1] = y + rnd(seed, i + n) * spread * 0.8; pos[i * 3 + 2] = z + (rnd(seed, i + 2 * n) - 0.5) * spread; } const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); p.add(new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.09, map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))); }
export function rain(p, cx, cy, cz, n = 900, box = 40) { const pos = new Float32Array(n * 6); for (let i = 0; i < n; i++) { const x = cx + (rnd(i, 1) - 0.5) * box, y = cy + rnd(i, 2) * 18, z = cz + (rnd(i, 3) - 0.5) * box; pos.set([x, y, z, x - 0.12, y - 0.7, z], i * 6); } const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); p.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#9db6ff', transparent: true, opacity: 0.13 }))); }
export function sky(p, stops, stars = true) { const t = canvasTex(64, 512, (x) => { const g = x.createLinearGradient(0, 0, 0, 512); stops.forEach(s => g.addColorStop(s[0], s[1])); x.fillStyle = g; x.fillRect(0, 0, 64, 512); }); const m = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false })); p.add(m);
  if (stars) { const n = 500, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = rnd(i, 5) * 6.283, e = 0.12 + rnd(i, 6) * 1.2; pos.set([Math.cos(a) * Math.cos(e) * 380, Math.sin(e) * 380, Math.sin(a) * Math.cos(e) * 380], i * 3); } const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); p.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: '#dfe8ff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }))); } }
/** Ящик-клетка с запертым помощником. */
export function cage(p, tm, x, z) { const g = new THREE.Group(); g.position.set(x, 0, z); p.add(g); const h = makeHelper(tm, 0, false); h.scale.setScalar(1.05); g.add(h); g.userData.helper = h; for (const y of [0.06, 1.5]) add(g, B(1.3, 0.12, 1.3), MAT.wood, 0, y, 0); for (let i = 0; i < 5; i++) for (const zz of [-0.6, 0.6]) add(g, C(0.03, 0.03, 1.4, 6), MAT.steel, -0.56 + i * 0.28, 0.78, zz); for (let i = 0; i < 5; i++) for (const xx of [-0.6, 0.6]) add(g, C(0.03, 0.03, 1.4, 6), MAT.steel, xx, 0.78, -0.56 + i * 0.28); add(g, RB(0.2, 0.2, 0.08, 0.03), MAT.warm, 0, 0.8, 0.66); glow(g, '#ffb14a', 1.6, 0, 0.8, 0.8, 0.9); return g; }
