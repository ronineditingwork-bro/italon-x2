// Маршрут: зоны, участки с брендами, препятствия и коробки X2. Без графики.
import { CONFIG, DERIVED } from './config.js';
import { createRng } from './rng.js';

export const rowZ = row => -(row + 0.5) * CONFIG.grid.tile;
export const zoneOfRow = row => Math.min(CONFIG.zones.length - 1, Math.floor(row / DERIVED.rowsPerZone));
export const zoneOfTime = t => Math.min(CONFIG.zones.length - 1, Math.floor(t / CONFIG.run.zoneDuration));

export function buildTrack(seed = CONFIG.seed) {
  const rng = createRng(seed);
  const { grid, brands, obstacles: oc, zones } = CONFIG;
  const zonesCount = zones.length;

  // --- участки с названиями брендов: равномерно по маршруту, названия не повторяются подряд ---
  const patches = [];
  const names = rng.shuffle(brands.replacementBrands);
  let nameIndex = 0;
  const perZone = brands.patchesPerZone;
  for (let z = 0; z < zonesCount; z++) {
    const start = z * DERIVED.rowsPerZone + 8;
    const span = DERIVED.rowsPerZone - 16 - brands.patchRows;
    for (let i = 0; i < perZone; i++) {
      const rowStart = Math.round(start + (span / Math.max(1, perZone - 1)) * i);
      const brand = names[nameIndex % names.length];
      patches.push({ id: patches.length, brand, rowStart, rowEnd: rowStart + brands.patchRows - 1, zone: z, tint: brands.tints[nameIndex % brands.tints.length] });
      nameIndex++;
    }
  }

  // --- препятствия: в каждой группе минимум одна свободная полоса ---
  const list = [];
  let z = -oc.startSafe;
  const endZ = -DERIVED.runRows * grid.tile;
  const lanes = grid.lanes;
  while (z > endZ + 6) {
    const zone = zoneOfRow(Math.floor(-z / grid.tile));
    const tighten = Math.pow(oc.zoneTighten, zone);
    z -= rng.range(oc.spacing[0], oc.spacing[1]) * tighten;
    if (z < endZ + 6) break;
    const blocked = rng.next() < 0.22 + zone * 0.05 ? 2 : 1;
    const freeLane = rng.int(0, lanes - 1);
    const pool = [...Array(lanes).keys()].filter(l => l !== freeLane);
    for (let k = 0; k < blocked; k++) {
      const lane = pool.splice(rng.int(0, pool.length - 1), 1)[0];
      const roll = rng.next();
      const type = roll < 0.45 ? 'cone' : roll < 0.78 ? 'barrier' : 'planter';
      list.push({ id: list.length, type, lane, x: DERIVED.laneX[lane], z, ...oc.types[type], hit: false });
    }
  }

  // --- коробки X2: в свободной от препятствий полосе ---
  const pickups = [];
  let pz = -oc.startSafe * 0.7;
  while (true) {
    pz -= rng.range(oc.pickupSpacing[0], oc.pickupSpacing[1]);
    if (pz < endZ + 8) break;
    const blockedLanes = new Set(list.filter(o => Math.abs(o.z - pz) < 3.5).map(o => o.lane));
    const free = [...Array(lanes).keys()].filter(l => !blockedLanes.has(l));
    if (!free.length) continue;
    const lane = rng.pick(free);
    pickups.push({ id: pickups.length, lane, x: DERIVED.laneX[lane], z: pz, taken: false });
  }

  return { patches, obstacles: list, pickups, rows: DERIVED.rows, runRows: DERIVED.runRows };
}
