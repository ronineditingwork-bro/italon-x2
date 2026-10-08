// Летящие плиты и частицы. Объекты берутся из пула и не создаются во время забега.
import * as THREE from '../../vendor/three.module.js';
import { glowTexture } from './textures.js';

export function createFx(maxParticles = 200, onLand = () => {}) {
  const group = new THREE.Group();

  // --- плиты (толщина слегка подчёркнута, чтобы был виден торец 20 мм) ---
  const slabGeo = new THREE.BoxGeometry(1.18, 0.26, 1.18);
  const slabMat = new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.45 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xbfb39d, roughness: 0.6 });
  const pool = Array.from({ length: 56 }, () => {
    const m = new THREE.Mesh(slabGeo, [edgeMat, edgeMat, slabMat, edgeMat, edgeMat, edgeMat]);
    m.visible = false; m.castShadow = true; group.add(m);
    return { mesh: m, active: false, t: 0, dur: 0.26, delay: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), spin: 0, row: 0, col: 0 };
  });

  // --- частицы ---
  const pos = new Float32Array(maxParticles * 3), vel = new Float32Array(maxParticles * 3), life = new Float32Array(maxParticles), alpha = new Float32Array(maxParticles);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: glowTexture(), size: 0.42, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd27a, sizeAttenuation: true, toneMapped: false, opacity: 0.95 });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; group.add(points);
  life.fill(0); for (let i = 0; i < maxParticles; i++) pos[i * 3 + 1] = -100;
  let cursor = 0;

  function burst(x, y, z, n = 7, spread = 1.6, up = 2.4) {
    for (let k = 0; k < n; k++) {
      const i = cursor++ % maxParticles;
      pos[i * 3] = x + (Math.random() - 0.5) * 0.6; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
      vel[i * 3] = (Math.random() - 0.5) * spread; vel[i * 3 + 1] = Math.random() * up + 0.6; vel[i * 3 + 2] = (Math.random() - 0.5) * spread;
      life[i] = 0.5 + Math.random() * 0.5;
    }
  }

  function spawnSlab(from, to, row, col, delay) {
    const s = pool.find(p => !p.active);
    if (!s) { onLand(row, col, to.x, to.y, to.z); return; }       // пул занят — укладываем сразу
    s.active = true; s.t = 0; s.delay = delay; s.row = row; s.col = col;
    s.from.copy(from); s.to.copy(to);
    s.spin = (Math.random() > 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.9);
    s.mesh.visible = false;
  }

  function update(dt) {
    for (const s of pool) {
      if (!s.active) continue;
      if (s.delay > 0) { s.delay -= dt; continue; }
      s.t += dt; s.mesh.visible = true;
      const u = Math.min(1, s.t / s.dur), e = u * u * (3 - 2 * u);
      s.mesh.position.lerpVectors(s.from, s.to, e);
      s.mesh.position.y += Math.sin(Math.PI * u) * 0.45;
      s.mesh.rotation.set((1 - e) * 0.7, (1 - e) * s.spin * 0.6, (1 - e) * 0.3);   // выходит из коробки ребром и ложится плашмя
      s.mesh.scale.setScalar(0.5 + 0.5 * e);                                 // из узкой щели выходит меньше, к посадке достигает размера плитки
      if (u >= 1) { s.active = false; s.mesh.visible = false; onLand(s.row, s.col, s.to.x, s.to.y, s.to.z); }
    }
    for (let i = 0; i < maxParticles; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      vel[i * 3 + 1] -= 6 * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (life[i] <= 0 || pos[i * 3 + 1] < 0) { life[i] = 0; pos[i * 3 + 1] = -100; }
    }
    geo.attributes.position.needsUpdate = true;
  }

  function clear() {
    pool.forEach(s => { s.active = false; s.mesh.visible = false; });
    life.fill(0); for (let i = 0; i < maxParticles; i++) pos[i * 3 + 1] = -100;
  }

  return { group, spawnSlab, burst, update, clear, dispose() { geo.dispose(); mat.map?.dispose(); mat.dispose(); slabGeo.dispose(); slabMat.dispose(); edgeMat.dispose(); } };
}
