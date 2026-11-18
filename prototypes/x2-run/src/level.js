// Уровень: земля с ямами, уступы, места появления врагов, дроны с коробками, арены боссов. Всё детерминировано seed-ом.
import { CONFIG } from './config.js';
import { createRng } from './rng.js';

export function buildLevel(seed = CONFIG.seed) {
  const rng = createRng(seed + CONFIG.seedOffsets.level);
  const L = CONFIG.zoneLen, ZN = CONFIG.zones.length;
  const gaps = [], ledges = [], spawns = [], patches = [], zones = [];
  const drones = [];

  for (let z = 0; z < ZN; z++) {
    const x0 = z * L, x1 = x0 + L;
    const start = x0 + (z === 0 ? 1200 : 800);
    const end = x1 - CONFIG.arenaBefore - 350;
    const arenaX = x1 - CONFIG.arenaBefore;
    zones.push({ index: z, x0, x1, arenaX, bossX: arenaX });

    let c = start;
    // каждая зона чуть плотнее предыдущей
    const nRun = () => rng.int(2, 3 + (z >= 2 ? 1 : 0));
    const patterns = [
      { w: 4, f: () => { const n = nRun(); for (let i = 0; i < n; i++) spawns.push({ type: 'runner', trigger: c + i * 190 }); c += 520 + n * 80; } },
      { w: 3, f: () => { spawns.push({ type: 'turret', x: c + 560 }); if (rng.next() < 0.6) spawns.push({ type: 'runner', trigger: c + 260 }); c += 1000; } },
      { w: 3, f: () => { const w = rng.int(170, 230), h = rng.int(100, 140), lx = c + 480; ledges.push({ x0: lx, x1: lx + w, h, kind: ledgeKind(z, rng), zone: z }); spawns.push({ type: 'turret', x: lx + w / 2, ledge: ledges.length - 1 }); spawns.push({ type: 'runner', trigger: lx - 260 }); c += 1100; } },
      { w: 3, f: () => { const n = rng.int(2, 3); for (let i = 0; i < n; i++) spawns.push({ type: 'flyer', trigger: c + i * 260, y: rng.range(-330, -215) }); c += 760 + n * 120; } },
      { w: z >= 1 ? 3 : 0, f: () => { const gw = rng.int(130, 175), gx = c + 520; gaps.push({ x0: gx, x1: gx + gw, kind: z === 3 ? 'water' : 'trench', zone: z }); if (rng.next() < 0.7) spawns.push({ type: 'runner', trigger: gx - 380 }); if (rng.next() < 0.5) ledges.push({ x0: gx - 40, x1: gx + gw + 40, h: rng.int(92, 120), kind: ledgeKind(z, rng), zone: z, bridge: true }); c += 1000 + gw; } },
      { w: z >= 1 ? 2 : 0, f: () => { spawns.push({ type: 'heavy', trigger: c + 300 }); if (z >= 2) spawns.push({ type: 'flyer', trigger: c + 520, y: rng.range(-320, -230) }); c += 1050; } },
      { w: 2, f: () => { const w = rng.int(160, 220), h = rng.int(96, 132), lx = c + 460; ledges.push({ x0: lx, x1: lx + w, h, kind: ledgeKind(z, rng), zone: z }); spawns.push({ type: 'runner', trigger: lx + 100 }); spawns.push({ type: 'flyer', trigger: lx + 220, y: -300 }); c += 950; } },
    ].filter(p => p.w > 0);
    const totalW = patterns.reduce((s, p) => s + p.w, 0);
    let last = null;
    while (c < end) {
      let r = rng.next() * totalW, p = patterns[0];
      for (const q of patterns) { r -= q.w; if (r <= 0) { p = q; break; } }
      if (p === last && rng.next() < 0.6) continue;     // меньше повторов подряд
      last = p; p.f();
    }

    // дроны с коробками — каждые ~1600 пикселей
    const zd = drones.length;
    for (let dx = start + 700; dx < end; dx += rng.int(1500, 1900)) drones.push({ trigger: dx, y: rng.range(-300, -235), item: pickItem(rng, z) });
    if (drones.length > zd + 1) drones[zd + 1].item = 'heart';          // в каждой зоне гарантированно есть сердце

    // названия брендов на старом покрытии
    const names = CONFIG.zones[z].brands;
    names.forEach((brand, i) => patches.push({ zone: z, brand, x0: start + i * 1500 - 100, x1: start + i * 1500 + 900 }));
  }
  const bosses = zones.map(zn => ({ zone: zn.index, x: zn.arenaX }));
  spawns.sort((a, b) => (a.trigger ?? a.x - 400) - (b.trigger ?? b.x - 400));
  drones.sort((a, b) => a.trigger - b.trigger);
  return { seed, length: ZN * L, zoneLen: L, zones, gaps, ledges, spawns, drones, patches, bosses };
}

function ledgeKind(z, rng) {
  const kinds = [['barrier', 'crate', 'step'], ['planter', 'crate', 'step'], ['bench', 'planter', 'crate'], ['lounger', 'crate', 'step']][z];
  return rng.pick(kinds);
}
function pickItem(rng, z) {
  const bag = ['fan', 'fan', 'fan', 'rapid', 'rapid', 'rapid', 'heavy', 'heavy', 'shield', 'shield', 'heart'];
  return rng.pick(bag);
}
