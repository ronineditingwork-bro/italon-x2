// Все настройки игры в одном месте: темп, оружие, враги, зоны. Размеры — в «пикселях мира» (высота кадра 720).
export const CONFIG = {
  version: '2.0.0-2d',
  seed: 20261015,

  view: { baseH: 720, defaultW: 1280, minW: 720, maxW: 1700, groundFromBottom: 168 },

  player: {
    w: 42, h: 115, crouchH: 68,
    runSpeed: 310, accel: 3400, friction: 4200, airControl: 0.9,
    jumpV: 940, gravity: 2500, fallMul: 1.12, jumpCut: 0.5, maxFall: 1300,
    coyote: 0.09, buffer: 0.12,
    hearts: 5, maxHearts: 7, invuln: 2.2, respawnInvuln: 2.8, shield: 7,
    camLead: 0.4, edgePad: 28,
    laneDepth: 0,
  },

  // оружие: плиты X2. count × spread — веер; pierce — прошивает врагов
  weapons: {
    slab:  { id: 'slab',  name: 'Плита',      interval: 0.17,  speed: 1000, dmg: 1, count: 1, spread: 0,    size: 1,   pierce: false },
    fan:   { id: 'fan',   name: 'Веер',       interval: 0.24,  speed: 900,  dmg: 1, count: 3, spread: 0.17, size: 1,   pierce: false },
    rapid: { id: 'rapid', name: 'Скорострел', interval: 0.075, speed: 1100, dmg: 1, count: 1, spread: 0.035, size: 0.8, pierce: false },
    heavy: { id: 'heavy', name: 'Тяжёлая',    interval: 0.34,  speed: 820,  dmg: 4, count: 1, spread: 0,    size: 1.8, pierce: true },
  },
  maxPlayerBullets: 22,
  bulletRange: 1500,

  // враги («брак»): hp, размеры, скорость; bonus — м², засчитанные за уничтоженный дефект
  enemies: {
    runner: { hp: 1, w: 62, h: 81, scale: 1.4, speed: [150, 235], bonus: 0.36 },
    flyer:  { hp: 2, w: 68, h: 49, scale: 1.3, speed: 125, bob: 46, shootEvery: [2.4, 3.6], bonus: 0.72 },
    turret: { hp: 5, w: 78, h: 90, scale: 1.3, closed: 2.0, open: 2.2, burst: 2, burstGap: 0.4, shotSpeed: 300, range: 700, bonus: 1.44 },
    heavy:  { hp: 8, w: 130, h: 103, scale: 1.35, speed: 70, charge: 280, windup: 0.7, chargeTime: 1.5, rest: 0.9, bonus: 2.16 },
    drone:  { hp: 1, w: 83, h: 55, scale: 1.3, speed: 115, bonus: 0.36 },
  },
  enemyBulletSpeed: 300,

  boss: { hp: [34, 46, 58, 76], w: 300, h: 190, bonus: 18 },

  // укладка: каждые tileLen пикселей пути — ряд из 6 плит по 0,36 м²
  lay: { lag: 150, tileLen: 96, rowM2: 2.16 },

  // зоны: длина, оформление, бренды на старом покрытии
  zones: [
    { id: 'parking',  name: 'ПАРКОВКА', title: 'Парковка', tagline: 'Потрескавшийся асфальт и старая плитка',       skyTop: '#7fa9d8', skyBottom: '#f8dcae', sun: '#ffd596', fog: '#f1d9b4', oldA: '#7c7f86', oldB: '#6b6e75', hill: '#9aa6b8', brands: ['Kerama Marazzi', 'Atlas Concorde'] },
    { id: 'driveway', name: 'К ДОМУ',   title: 'Подъезд к дому', tagline: 'Дорожка к дому: дроны и люки', skyTop: '#86b2dd', skyBottom: '#f9d9a8', sun: '#ffd08a', fog: '#f2d6ad', oldA: '#b69373', oldB: '#a58263', hill: '#a3b3b9', brands: ['Estima', 'Rex'] },
    { id: 'sidewalk', name: 'ТРОТУАР',  title: 'Тротуар', tagline: 'Городские витрины и тяжёлая техника',        skyTop: '#7fb0e3', skyBottom: '#fad7a0', sun: '#ffca7e', fog: '#f3d3a6', oldA: '#a9aaa6', oldB: '#97988f', hill: '#a9b9b0', brands: ['FMG', 'Idalgo'] },
    { id: 'pool',     name: 'БАССЕЙН',  title: 'У бассейна', tagline: 'Осторожно: ямы с водой',     skyTop: '#6ea6e0', skyBottom: '#fbcf93', sun: '#ffbf70', fog: '#f4cfa0', oldA: '#cdb08f', oldB: '#bb9d7c', hill: '#a5c0bd', brands: ['VitrA', 'Laparet'] },
  ],
  zoneLen: 7000,
  arenaBefore: 1100,         // расстояние от конца зоны до начала арены босса

  seedOffsets: { level: 11, scenery: 77 },
};

export const BRANDS = ['Atlas Concorde', 'Kerama Marazzi', 'Estima', 'VitrA', 'Laparet', 'Idalgo', 'Creto', 'FMG', 'Rex'];
