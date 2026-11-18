// Покрытие маршрута (старые и новые плитки), названия брендов, препятствия, коробки X2, декорации.
import * as THREE from '../../vendor/three.module.js';
import { CONFIG, DERIVED } from '../config.js';
import { rowZ, zoneOfRow } from '../track.js';
import { brandLabelTexture, x2DecalTexture, kraftTexture, glowTexture, marbleTexture, graniteTexture } from './textures.js';
import { buildDecor, buildPool } from './decor.js';
import { buildGround } from './ground.js';
import { RoundedBoxGeometry } from '../../vendor/RoundedBoxGeometry.js';

const TILE = CONFIG.grid.tile;
const COLS = CONFIG.grid.columns;
const TOP_NEW = 0.03;

const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) >>> 0; h = (h ^ (h >>> 13)) * 1274126177 >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** Каждая плитка берёт своё окно общей текстуры: узор не повторяется от плитки к плитке. */
function uvJitter(mat) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aUvOff;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_MAP
  vec2 uvc = vMapUv - 0.5; if (aUvOff.z > 0.5) uvc = vec2(-uvc.y, uvc.x);
  vMapUv = uvc * 0.5 + 0.5 + aUvOff.xy;
#endif`);
  };
  return mat;
}
function uvOffsets(count, seed) {
  const a = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { a[i * 3] = hash(i, seed); a[i * 3 + 1] = hash(seed, i + 7); a[i * 3 + 2] = hash(i + 3, seed + 5) < 0.5 ? 0 : 1; }
  return new THREE.InstancedBufferAttribute(a, 3);
}

export function createWorld(game, quality) {
  const group = new THREE.Group();
  const rows = DERIVED.rows, count = rows * COLS;
  const track = game.track;

  // --- основание и стыки ---
  const base = new THREE.Mesh(new THREE.BoxGeometry(COLS * TILE + 0.4, 0.2, rows * TILE), new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 1 }));
  base.position.set(0, -0.2, -rows * TILE / 2); base.receiveShadow = true; group.add(base);
  const startPad = new THREE.Mesh(new THREE.BoxGeometry(COLS * TILE + 0.4, 0.2, 44), new THREE.MeshStandardMaterial({ color: 0x8c8a85, roughness: 0.9 }));
  startPad.position.set(0, -0.11, 22); startPad.receiveShadow = true; group.add(startPad);

  // --- площадки, газоны, асфальт, клумбы рядом с дорожкой ---
  group.add(buildGround());

  // --- старые плитки ---
  const oldGeo = new THREE.BoxGeometry(TILE - 0.07, 0.16, TILE - 0.07);
  oldGeo.setAttribute('aUvOff', uvOffsets(count, 11));
  const oldMat = uvJitter(new THREE.MeshStandardMaterial({ map: graniteTexture(), color: 0xffffff, roughness: 0.82 }));
  oldMat.userData.env = 0.35;
  const oldTiles = new THREE.InstancedMesh(oldGeo, oldMat, count);
  oldTiles.receiveShadow = true;
  const patchOfRow = new Int16Array(rows).fill(-1);
  track.patches.forEach((p, i) => { for (let r = p.rowStart; r <= p.rowEnd; r++) patchOfRow[r] = i; });
  for (let r = 0; r < rows; r++) {
    const zone = CONFIG.zones[zoneOfRow(Math.min(r, DERIVED.runRows - 1))];
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      v3.set(DERIVED.columnX[c], -0.08, rowZ(r));
      oldTiles.setMatrixAt(i, m4.compose(v3, q0, s3.set(1, 1, 1)));
      const patch = patchOfRow[r];
      col.set(patch >= 0 ? track.patches[patch].tint : zone.oldColor);
      const k = (hash(r, c) - 0.5) * 2 * zone.oldVary + (((r + c) & 1) ? 0.015 : -0.015);
      col.offsetHSL(0, 0, k).multiplyScalar(1.7);
      oldTiles.setColorAt(i, col);
    }
  }
  group.add(oldTiles);

  // --- новые плитки X2 (скрыты до укладки) ---
  const newGeo = new RoundedBoxGeometry(TILE - 0.014, 0.22, TILE - 0.014, 2, 0.02);
  newGeo.setAttribute('aUvOff', uvOffsets(count, 29));
  const newMat = uvJitter(new THREE.MeshStandardMaterial({ map: marbleTexture(), color: 0xffffff, roughness: 0.3, metalness: 0.0 }));
  newMat.userData.env = 0.95;
  const newTiles = new THREE.InstancedMesh(newGeo, newMat, count);
  newTiles.receiveShadow = true; newTiles.castShadow = false;
  const decalGeo = new THREE.PlaneGeometry(TILE * 0.52, TILE * 0.52); decalGeo.rotateX(-Math.PI / 2);
  const decals = new THREE.InstancedMesh(decalGeo, new THREE.MeshBasicMaterial({ map: x2DecalTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), count);
  const hidden = m4.clone().compose(v3.set(0, -50, 0), q0, s3.set(0, 0, 0));
  for (let i = 0; i < count; i++) {
    newTiles.setMatrixAt(i, hidden); decals.setMatrixAt(i, hidden);
    const r = (i / COLS) | 0, c = i % COLS;
    col.set(0xeadfcc).offsetHSL(0, 0, (hash(r + 5, c + 9) - 0.5) * 0.05);
    newTiles.setColorAt(i, col);
  }
  // границы InstancedMesh считаются один раз, а плитки появляются позже: отсечение по кадру отключаем
  oldTiles.frustumCulled = newTiles.frustumCulled = decals.frustumCulled = false;
  group.add(newTiles, decals);

  // --- названия брендов на старом покрытии ---
  const labels = track.patches.map(p => {
    const mat = new THREE.MeshBasicMaterial({ map: brandLabelTexture(p.brand), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, toneMapped: false });
    const w = (p.rowEnd - p.rowStart + 1) * TILE * 0.9, geo = new THREE.PlaneGeometry(w, w / 4);
    geo.rotateX(-Math.PI / 2); geo.rotateY(Math.PI / 2);                  // надпись читается вдоль движения, снизу-вверх по кадру
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0.016, (rowZ(p.rowStart) + rowZ(p.rowEnd)) / 2);
    group.add(mesh);
    return { p, mesh, laid: 0, total: (p.rowEnd - p.rowStart + 1) * COLS };
  });

  // --- декорации и вода ---
  group.add(buildDecor(quality.decor));
  const water = buildPool(); group.add(water);

  // --- препятствия ---
  const obstacleMeshes = new Map();
  const stone = new THREE.MeshStandardMaterial({ color: 0xb9b4a7, roughness: 0.9 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.6 });
  const red = new THREE.MeshStandardMaterial({ color: 0xd9352b, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.7 });
  const green = new THREE.MeshStandardMaterial({ color: 0x4f8a3a, roughness: 0.95 });
  const mk = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };
  const makeObstacle = o => {
    const g = new THREE.Group();
    if (o.type === 'cone') {
      g.add(mk(new THREE.BoxGeometry(0.7, 0.06, 0.7), dark, 0, 0.03, 0));
      g.add(mk(new THREE.ConeGeometry(0.26, 0.9, 12), orange, 0, 0.51, 0));
      g.add(mk(new THREE.CylinderGeometry(0.15, 0.18, 0.1, 12), white, 0, 0.5, 0));
    } else if (o.type === 'barrier') {
      for (const s of [-1, 1]) g.add(mk(new THREE.BoxGeometry(0.1, 0.78, 0.5), dark, s * 0.62, 0.39, 0));
      for (let i = 0; i < 7; i++) g.add(mk(new THREE.BoxGeometry(0.2, 0.2, 0.1), i % 2 ? white : red, -0.6 + i * 0.2, 0.68, 0));
      for (let i = 0; i < 7; i++) g.add(mk(new THREE.BoxGeometry(0.2, 0.2, 0.1), i % 2 ? red : white, -0.6 + i * 0.2, 0.42, 0));
    } else {
      g.add(mk(new THREE.BoxGeometry(1.45, 1.0, 1.45), stone, 0, 0.5, 0));
      g.add(mk(new THREE.BoxGeometry(1.55, 0.12, 1.55), new THREE.MeshStandardMaterial({ color: 0xcfcabc, roughness: 0.9 }), 0, 1.0, 0));
      g.add(mk(new THREE.IcosahedronGeometry(0.7, 1), green, 0, 1.45, 0));
    }
    g.position.set(o.x, 0, o.z);
    group.add(g);
    obstacleMeshes.set(o.id, { g, knock: 0 });
  };
  track.obstacles.forEach(makeObstacle);

  // --- коробки X2 ---
  const kraft = new THREE.MeshStandardMaterial({ map: kraftTexture(), roughness: 0.9 });
  const kraftPlain = new THREE.MeshStandardMaterial({ map: kraftTexture({ label: false }), roughness: 0.9 });
  const glowMap = glowTexture('rgba(255,236,170,0.9)', 'rgba(255,190,80,0.35)');
  const pickupMeshes = new Map();
  track.pickups.forEach(p => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.6, 0.68), [kraft, kraft, kraftPlain, kraftPlain, kraft, kraft]); b.castShadow = true; g.add(b);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); glow.scale.set(2.2, 2.2, 1); g.add(glow);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.62, 28), new THREE.MeshBasicMaterial({ color: 0xffc866, transparent: true, opacity: 0.6, side: THREE.DoubleSide, toneMapped: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = -0.82; g.add(ring);
    g.position.set(p.x, 1.1, p.z); group.add(g);
    pickupMeshes.set(p.id, { g, b, t: 0, taken: false });
  });

  // --- состояние анимации укладки ---
  const pops = [];
  let placed = 0;

  function placeTile(row, colIdx) {
    const i = row * COLS + colIdx;
    oldTiles.setMatrixAt(i, hidden); oldTiles.instanceMatrix.needsUpdate = true;
    v3.set(DERIVED.columnX[colIdx], TOP_NEW - 0.11, rowZ(row));
    newTiles.setMatrixAt(i, m4.compose(v3, q0, s3.set(1, 1, 1)));
    newTiles.instanceMatrix.needsUpdate = true;
    if (hash(row, colIdx + 3) < 0.11) {                                  // маркировка X2 на части плиток
      v3.set(DERIVED.columnX[colIdx], TOP_NEW + 0.004, rowZ(row));
      decals.setMatrixAt(i, m4.compose(v3, q0, s3.set(1, 1, 1))); decals.instanceMatrix.needsUpdate = true;
    }
    placed++;
    pops.push({ i, row, colIdx, t: 0 });
    const patch = patchOfRow[row];
    if (patch >= 0) { const l = labels[patch]; l.laid++; }
  }

  function update(dt, time, robotZ) {
    // всплеск при посадке плиты: плитка чуть «приседает» и выравнивается
    for (let k = pops.length - 1; k >= 0; k--) {
      const p = pops[k]; p.t += dt;
      const u = Math.min(1, p.t / 0.22), e = 1 - Math.pow(1 - u, 3);
      const lift = (1 - e) * 0.07 * Math.sin(Math.PI * (1 - u) * 0.5);
      v3.set(DERIVED.columnX[p.colIdx], TOP_NEW - 0.11 + lift, rowZ(p.row));
      newTiles.setMatrixAt(p.i, m4.compose(v3, q0, s3.set(1, 1, 1)));
      newTiles.instanceMatrix.needsUpdate = true;
      if (u >= 1) pops.splice(k, 1);
    }
    // названия исчезают, когда на участке начали менять покрытие
    for (const l of labels) {
      const frac = l.laid / l.total;
      l.mesh.material.opacity = Math.max(0, 1 - frac / 0.12);
      l.mesh.visible = l.mesh.material.opacity > 0.01 && Math.abs(l.mesh.position.z - robotZ) < 70;
    }
    // коробки X2 парят
    for (const pk of pickupMeshes.values()) {
      if (pk.taken) { pk.t += dt; const s = Math.max(0, 1 - pk.t * 5); pk.g.scale.setScalar(s); pk.g.visible = s > 0.01; continue; }
      pk.b.rotation.y = time * 1.6; pk.g.position.y = 1.1 + Math.sin(time * 2.4 + pk.g.position.z) * 0.12;
    }
    // сбитые препятствия
    for (const ob of obstacleMeshes.values()) {
      if (ob.knock > 0 && ob.knock < 1) {
        ob.knock = Math.min(1, ob.knock + dt * 2.2);
        ob.g.position.y = Math.sin(ob.knock * Math.PI) * 1.2; ob.g.rotation.z = ob.knock * 5; ob.g.rotation.x = ob.knock * 3;
        ob.g.scale.setScalar(1 - ob.knock * 0.5);
        if (ob.knock >= 1) ob.g.visible = false;
      }
    }
    water.material.map.offset.set(time * 0.012, time * 0.007);
  }

  return {
    group,
    placeTile,
    update,
    get placed() { return placed; },
    knock(id) { const o = obstacleMeshes.get(id); if (o) o.knock = 0.001; },
    takePickup(id) { const p = pickupMeshes.get(id); if (p) p.taken = true; },
    pickupPosition(id) { const p = pickupMeshes.get(id); return p ? p.g.position : null; },
    dispose() {
      group.traverse(o => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { x.map?.dispose?.(); x.dispose?.(); }); });
      oldTiles.dispose(); newTiles.dispose(); decals.dispose();
    },
  };
}
