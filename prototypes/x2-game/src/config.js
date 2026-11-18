// Все настройки прототипа в одном месте: численные значения и список брендов можно править без правки логики.
export const CONFIG = {
  version: '0.1.0-prototype',
  seed: 20261008,

  // --- забег ---
  run: {
    duration: 60,          // секунд на забег
    zoneDuration: 15,      // секунд на зону (4 зоны)
    speed: 6,              // единиц мира в секунду
    lives: 3,              // три столкновения завершают забег
    hitProtection: 1.6,    // секунд неуязвимости после столкновения
    laneChangeSpeed: 15,   // единиц/с при перестроении
    jumpVelocity: 10.5,
    gravity: 28,
    wideDuration: 4,       // секунд широкой укладки после сбора коробки X2
    layLag: 1.1,           // насколько позади робота укладывается ряд (ед.)
  },

  // --- сетка покрытия ---
  grid: {
    tile: 1.2,             // сторона плитки в мире
    columns: 6,            // три полосы по две плитки
    lanes: 3,
    tileAreaM2: 0.36,      // условная площадь одной плитки для счёта (не коммерческий расчёт)
    tailRows: 24,          // запас рядов за финишем (для вида)
  },

  // --- столкновения ---
  collision: {
    zRadius: 0.8,          // зона удара высокого препятствия
    jumpZRadius: 0.6,      // у низких препятствий зона удара меньше: прыжок прощает неточность
    xRadius: 1.0,
    pickupZRadius: 0.9,
    pickupXRadius: 1.15,
    pickupMaxHeight: 1.7,
  },

  // --- зоны маршрута (по порядку) ---
  zones: [
    { id: 'parking',  name: 'ПАРКОВКА', title: 'Парковка',        oldColor: 0x6e7176, oldVary: 0.07, ground: 0x5a5d62 },
    { id: 'driveway', name: 'К ДОМУ',   title: 'Подъезд к дому',  oldColor: 0xb08a68, oldVary: 0.08, ground: 0x7d8a5e },
    { id: 'sidewalk', name: 'ТРОТУАР',  title: 'Тротуар',         oldColor: 0xa4a5a1, oldVary: 0.06, ground: 0x8a9462 },
    { id: 'pool',     name: 'БАССЕЙН',  title: 'У бассейна',      oldColor: 0xc7a98b, oldVary: 0.06, ground: 0x7f9a5c },
  ],

  // --- бренды заменяемых покрытий (отдельно от игровой логики) ---
  brands: {
    replacementBrands: [
      'Atlas Concorde', 'Atlas Concorde Russia', 'Kerama Marazzi', 'Estima', 'VitrA',
      'Laparet', 'Idalgo', 'Уральский гранит', 'Creto', 'FMG', 'Rex',
    ],
    newSurfaceBrand: 'X2',
    patchRows: 8,          // длина участка с названием, рядов
    patchesPerZone: 3,
    // цвет участка по бренду (как на концепте: терракот, графит, беж, сланец, розовато-коричневый)
    brandTints: { 'Kerama Marazzi': 0xd9a982, 'Atlas Concorde': 0x7f8793, 'Atlas Concorde Russia': 0x8a8f98, 'Estima': 0xd2b997, 'FMG': 0x5a5e66, 'Rex': 0xb98c80, 'VitrA': 0xaab4b8, 'Laparet': 0xb9ae9a, 'Idalgo': 0x9ba39a, 'Creto': 0xc1a79a, 'Уральский гранит': 0x8c8a86 },
    tints: [0xb9a58a, 0x8f9aa3, 0xa9b49a, 0xc4a995, 0x99a2b8, 0xb5b0a2, 0xa18f86, 0xaeb7a6, 0x9c9a8e, 0xb7a6b0, 0x9fb1ad],
  },

  // --- препятствия и коробки ---
  obstacles: {
    // jumpable: можно перепрыгнуть; h — высота, до которой нужно подняться
    types: {
      cone:    { h: 0.95, jumpable: true,  w: 0.6 },
      barrier: { h: 0.8,  jumpable: true,  w: 1.4 },
      planter: { h: 1.9,  jumpable: false, w: 1.5 },
    },
    spacing: [9.5, 15],            // расстояние между группами, ед. (по зонам сужается на zoneTighten)
    zoneTighten: 0.9,
    pickupSpacing: [24, 38],
    startSafe: 24,                 // без препятствий в начале
  },

  // --- качество ---
  quality: {
    default: 'auto',               // auto | high | low
    high: { pixelRatio: 2, shadows: true, shadowMap: 2048, particles: 240, decor: 1.0, post: true, msaa: 4 },
    low:  { pixelRatio: 1.25, shadows: false, shadowMap: 0, particles: 70, decor: 0.45, post: false, msaa: 0 },
  },

  camera: {
    // камера стоит справа-сзади и смотрит по диагонали: робот бежит слева направо вверх, как на концепте
    landscape: { fov: 30, side: 8.4, height: 7.6, back: 9.6, ahead: 3.4, lookY: 0.5, aimX: -0.8 },   // ahead — на сколько впереди робота камера смотрит
    portrait:  { fov: 46, side: 6.6, height: 10.6, back: 11.2, ahead: 2.4, lookY: 0.4, aimX: -0.8 },
    follow: 0.5,                   // насколько камера смещается за роботом по X
    robotYaw: -0.85,                // робот чуть повёрнут к камере, чтобы было видно лицо
  },
};

// Производные величины (считаются из настроек)
export const DERIVED = (() => {
  const c = CONFIG;
  const laneWidth = c.grid.tile * (c.grid.columns / c.grid.lanes);
  const laneX = Array.from({ length: c.grid.lanes }, (_, i) => (i - (c.grid.lanes - 1) / 2) * laneWidth);
  const columnX = Array.from({ length: c.grid.columns }, (_, i) => (i - (c.grid.columns - 1) / 2) * c.grid.tile);
  const zoneLength = c.run.speed * c.run.zoneDuration;
  const rowsPerZone = Math.round(zoneLength / c.grid.tile);
  const runRows = rowsPerZone * c.zones.length;
  return { laneWidth, laneX, columnX, zoneLength, rowsPerZone, runRows, rows: runRows + c.grid.tailRows, pathHalfWidth: c.grid.columns * c.grid.tile / 2 };
})();
