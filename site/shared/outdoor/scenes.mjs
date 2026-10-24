// X2 Outdoor Lab: готовые сцены. Сцена = фотография дома без покрытия + камера (для масштаба и перспективы) + зоны-поверхности (контуры в пикселях картинки).
// Новая сцена добавляется сюда и картинкой в public/media/outdoor/: код менять не нужно. Зоны — не больше четырёх на сцену (каналы маски).
//
// camera: fov — поле зрения по ширине кадра (°), horizon — линия горизонта в пикселях картинки, yaw — поворот камеры вокруг вертикали (°), height — высота камеры над землёй (м).
// Это правдоподобная оценка по снимку, а не измерение: масштаб плитки около ±15 %, площадь — ориентировочная.
// rings[0] — внешний контур зоны, остальные — вырезы (мебель, горшки, ступени). Края дополнительно уточняются по цвету основания (трава, вода, дерево не закрашиваются).
import { cameraHomography } from './geometry.mjs';

export const SCENES = [
  {
    id: 'modern-pool', title: 'Современный дом с бассейном', short: 'Дом с бассейном', city: 'Терраса, бассейн и дорожка', image: 'media/outdoor/modern-pool.webp', thumb: 'media/outdoor/modern-pool-thumb.webp', width: 1536, height: 447, focus: [0.58, 0.6],
    camera: { fov: 80, horizon: 150, yaw: 3.1, height: 0.8 },
    zones: [
      { id: 'terrace', label: 'Терраса', type: 'terrace', rings: [[[0, 300], [0, 222], [500, 222], [625, 205], [800, 201], [803, 213], [703, 273], [450, 308]], [[0, 205], [405, 205], [405, 226], [385, 252], [275, 254], [140, 252], [138, 272], [75, 275], [75, 285], [0, 285]]] },
      { id: 'path', label: 'Площадка и дорожка', type: 'path', rings: [[[445, 308], [703, 277], [1000, 277], [1187, 362], [1295, 447], [205, 447]]] },
      { id: 'pool', label: 'У бассейна', type: 'pool', rings: [[[1130, 206], [1175, 206], [1175, 214], [1300, 227], [1400, 245], [1536, 265], [1536, 295], [1400, 272], [1300, 252], [1200, 230], [1130, 220]]] },
    ],
  },
  {
    id: 'log-house', title: 'Сруб', short: 'Сруб', city: 'Площадка у входа и садовая дорожка', image: 'media/outdoor/log-house.webp', thumb: 'media/outdoor/log-house-thumb.webp', width: 765, height: 444, focus: [0.55, 0.7],
    camera: { fov: 85, horizon: 190, yaw: 17, height: 1.2 },
    zones: [
      { id: 'entry', label: 'Площадка у входа', type: 'terrace', rings: [[[274, 234], [380, 237], [467, 256], [560, 300], [305, 300], [300, 285]]] },
      { id: 'path', label: 'Садовая дорожка', type: 'path', rings: [[[305, 300], [560, 300], [765, 345], [765, 444], [150, 444], [161, 415], [172, 371], [343, 354], [300, 300]]] },
    ],
  },
  {
    id: 'fachwerk-fire', title: 'Фахверк с кострищем', short: 'Фахверк', city: 'Терраса и зона кострища', image: 'media/outdoor/fachwerk-fire.webp', thumb: 'media/outdoor/fachwerk-fire-thumb.webp', width: 765, height: 444, focus: [0.6, 0.65],
    camera: { fov: 85, horizon: 200, yaw: -29, height: 1.3 },
    zones: [
      { id: 'terrace', label: 'Терраса', type: 'terrace', rings: [[[350, 218], [550, 218], [622, 243], [625, 290], [320, 290]]] },
      { id: 'fire', label: 'Зона кострища', type: 'patio', rings: [[[305, 289], [626, 290], [634, 444], [206, 444], [260, 424], [350, 361], [406, 331], [325, 312], [307, 300]]] },
    ],
  },
  {
    id: 'red-brick', title: 'Кирпичный дом с забором «расчёска»', short: 'Кирпичный дом', city: 'Красный кирпич, окна RAL 7024, терраса и дорожка',
    image: 'media/outdoor/red-brick.webp', thumb: 'media/outdoor/red-brick-thumb.webp',
    width: 1536, height: 1024, focus: [0.58, 0.65],
    camera: { fov: 76, horizon: 470, yaw: -12, height: 1.5 },
    zones: [
      { id: 'terrace', label: 'Терраса', type: 'terrace', rings: [[[215,524],[480,487],[861,490],[1030,540],[900,562],[555,570],[265,546]]] },
      { id: 'path', label: 'Дорожка к дому', type: 'path', rings: [[[1108,549],[1428,590],[1390,642],[1125,771],[820,1023],[475,1023],[630,890],[920,636]]] },
    ],
  },
  {
    id: 'white-country', title: 'Белый дом в стиле американский кантри', short: 'Американский кантри', city: 'Белый фасад, тёмная крыша, веранда и сад',
    image: 'media/outdoor/white-country.webp', thumb: 'media/outdoor/white-country-thumb.webp',
    width: 1536, height: 1024, focus: [0.54, 0.65],
    camera: { fov: 77, horizon: 485, yaw: 5, height: 1.5 },
    zones: [
      { id: 'terrace', label: 'Терраса', type: 'terrace', rings: [[[40,598],[385,539],[1000,553],[1230,612],[1085,685],[817,701],[450,649],[40,622]]] },
      { id: 'path', label: 'Дорожка к веранде', type: 'path', rings: [[[1150,613],[1450,680],[1260,1023],[521,1023],[829,769]]] },
    ],
  },
];
export const sceneById = id => SCENES.find(s => s.id === id) || null;
/** Гомография земли для сцены (камера → плоскость). */
export const sceneHomography = scene => cameraHomography({ width: scene.width, height: scene.height, horizon: scene.camera.horizon, yawDeg: scene.camera.yaw, fovDeg: scene.camera.fov, heightM: scene.camera.height });
