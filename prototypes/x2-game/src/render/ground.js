// Покрытие вокруг дорожки: площадки, асфальт, клумбы с щебнем, газон, бордюры. Тонкие плоскости с повторяющимися текстурами.
import * as THREE from '../../vendor/three.module.js';
import { CONFIG, DERIVED } from '../config.js';
import { plazaTexture, asphaltTexture, gravelTexture, lawnTexture } from './textures.js';

/** Границы полос по X для каждой зоны: общий план, по которому декор расставляет кусты, фонари и машины. */
export const LAYOUT = (() => {
  const H = DERIVED.pathHalfWidth;
  return {
    H,
    // sides[zone] = { left|right: [{ kind, from, to }] }, from/to — расстояние от оси дорожки по модулю
    zones: [
      { // парковка: бордюр, клумба с щебнем, асфальт
        left:  [{ kind: 'curb', from: H, to: H + 0.3 }, { kind: 'bed', from: H + 0.3, to: H + 2.3 }, { kind: 'asphalt', from: H + 2.3, to: 30 }],
        right: [{ kind: 'curb', from: H, to: H + 0.3 }, { kind: 'bed', from: H + 0.3, to: H + 2.3 }, { kind: 'asphalt', from: H + 2.3, to: 30 }],
      },
      { // подъезд к дому: слева площадка к гаражу, справа клумба и газон
        left:  [{ kind: 'plaza', from: H, to: 6.9 }, { kind: 'lawn', from: 6.9, to: 30 }],
        right: [{ kind: 'curb', from: H, to: H + 0.3 }, { kind: 'bed', from: H + 0.3, to: H + 2.3 }, { kind: 'lawn', from: H + 2.3, to: 30 }],
      },
      { // тротуар
        left:  [{ kind: 'plaza', from: H, to: H + 3.4 }, { kind: 'curb', from: H + 3.4, to: H + 3.7 }, { kind: 'bed', from: H + 3.7, to: H + 5.7 }, { kind: 'lawn', from: H + 5.7, to: 30 }],
        right: [{ kind: 'plaza', from: H, to: H + 3.4 }, { kind: 'curb', from: H + 3.4, to: H + 3.7 }, { kind: 'bed', from: H + 3.7, to: H + 5.7 }, { kind: 'lawn', from: H + 5.7, to: 30 }],
      },
      { // у бассейна: справа терраса и бассейн, слева площадка дома
        left:  [{ kind: 'plaza', from: H, to: H + 3.0 }, { kind: 'curb', from: H + 3.0, to: H + 3.3 }, { kind: 'bed', from: H + 3.3, to: H + 5.3 }, { kind: 'lawn', from: H + 5.3, to: 30 }],
        right: [{ kind: 'plaza', from: H, to: H + 2.6 }, { kind: 'pool', from: H + 2.6, to: H + 12.4 }, { kind: 'plaza', from: H + 12.4, to: H + 15 }, { kind: 'lawn', from: H + 15, to: 40 }],
      },
    ],
  };
})();

const Y = { lawn: -0.15, plaza: -0.025, asphalt: -0.035, bed: -0.03, poolFloor: -0.135 };

export function buildGround() {
  const group = new THREE.Group();
  const zoneLen = DERIVED.zoneLength, tail = DERIVED.rows * CONFIG.grid.tile - DERIVED.runRows * CONFIG.grid.tile;
  const mats = {
    lawn: new THREE.MeshStandardMaterial({ map: lawnTexture(), roughness: 1 }),
    plaza: new THREE.MeshStandardMaterial({ map: plazaTexture(), roughness: 0.72 }),
    asphalt: new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.95 }),
    bed: new THREE.MeshStandardMaterial({ map: gravelTexture(), roughness: 1 }),
    pool: new THREE.MeshStandardMaterial({ color: 0x86d6dc, roughness: 0.6 }),
    curb: new THREE.MeshStandardMaterial({ color: 0xd6d0c4, roughness: 0.7 }),
  };
  mats.plaza.userData.env = 0.3;
  const tex = { lawn: 6, plaza: 2.4, asphalt: 5, bed: 2 };

  function plane(kind, x0, x1, z0, z1, y, repeat = tex[kind] ?? 3) {
    const w = x1 - x0, l = z0 - z1;                                     // z0 — ближний край (больше), z1 — дальний
    const g = new THREE.PlaneGeometry(w, l); g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / repeat, uv.getY(i) * l / repeat);
    const m = new THREE.Mesh(g, mats[kind]); m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true;
    group.add(m); return m;
  }
  function curb(x0, x1, z0, z1) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.16, z0 - z1), mats.curb);
    m.position.set((x0 + x1) / 2, 0.0, (z0 + z1) / 2); m.receiveShadow = m.castShadow = true; group.add(m);
  }

  // общий газон под всем
  const lawn = new THREE.PlaneGeometry(500, DERIVED.rows * CONFIG.grid.tile + 360); lawn.rotateX(-Math.PI / 2);
  const luv = lawn.attributes.uv; for (let i = 0; i < luv.count; i++) luv.setXY(i, luv.getX(i) * 500 / tex.lawn, luv.getY(i) * (DERIVED.rows * CONFIG.grid.tile + 360) / tex.lawn);
  const lm = new THREE.Mesh(lawn, mats.lawn); lm.position.set(0, Y.lawn, -DERIVED.rows * CONFIG.grid.tile / 2 + 60); lm.receiveShadow = true; group.add(lm);

  // зоны вдоль маршрута; первая заходит на стартовую площадку (z > 0), последняя — на хвост за финишем
  LAYOUT.zones.forEach((zone, zi) => {
    const zFrom = zi === 0 ? 46 : -zi * zoneLen;
    const zTo = zi === LAYOUT.zones.length - 1 ? -(zi + 1) * zoneLen - tail - 30 : -(zi + 1) * zoneLen;
    for (const [side, sign] of [['left', -1], ['right', 1]]) {
      for (const strip of zone[side]) {
        const x0 = sign > 0 ? strip.from : -strip.to, x1 = sign > 0 ? strip.to : -strip.from;
        if (strip.kind === 'lawn') continue;                          // газон уже есть
        if (strip.kind === 'curb') { curb(x0, x1, zFrom, zTo); continue; }
        if (strip.kind === 'pool') {                                  // дно бассейна ниже, вода сверху (в decor.js), по торцам — площадки
          plane('pool', x0, x1, zFrom - 6, zTo + 6, Y.poolFloor);
          plane('plaza', x0, x1, zFrom, zFrom - 6, Y.plaza); plane('plaza', x0, x1, zTo + 6, zTo, Y.plaza);
          continue;
        }
        plane(strip.kind, x0, x1, zFrom, zTo, Y[strip.kind] ?? Y.plaza);
      }
    }
  });
  return group;
}
