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
    camera: { fov: 76, horizon: 335, yaw: -12, height: 1.5 },
    zones: [
      { id: 'terrace', label: 'Терраса', type: 'terrace', rings: [[[217,537],[290,520],[523,489],[657,487],[943,500],[943,517],[1097,550],[1124,557],[890,648],[677,605],[450,575],[297,557],[217,545]]] },
      { id: 'path', label: 'Дорожка к дому', type: 'path', rotate: 58.8, rings: [[[1143,560],[1150,540],[1250,510],[1420,515],[1435,530],[1290,670],[1220,745],[1155,780],[1140,1024],[475,1024],[515,935],[528,834],[670,760],[780,735],[905,664]]] },
    ],
  },
  {
    id: 'white-country', title: 'Белый дом в стиле американский кантри', short: 'Американский кантри', city: 'Белый фасад, тёмная крыша, веранда и сад',
    image: 'media/outdoor/white-country.webp', thumb: 'media/outdoor/white-country-thumb.webp',
    width: 1536, height: 1024, focus: [0.54, 0.65],
    camera: { fov: 77, horizon: 345, yaw: 5, height: 1.5 },
    zones: [
      { id: 'terrace', label: 'Терраса', type: 'terrace', rings: [[[50,590],[200,560],[380,548],[1000,552],[1280,576],[1255,612],[975,744],[790,726],[630,696],[300,651],[150,626],[50,596]]] },
      { id: 'path', label: 'Дорожка к веранде', type: 'path', rotate: 41.4, rings: [[[975,744],[1255,612],[1440,620],[1370,780],[1290,960],[1265,1024],[450,1024],[594,920],[798,826]]] },
    ],
  },
  {
    id: 'industrial', title: 'Индустриальный дом: бетон, кортен, чёрное дерево', short: 'Индустриальный дом', city: 'Бетон, кортен, обожжённое дерево; терраса и входная площадка',
    image: 'media/outdoor/industrial.webp', thumb: 'media/outdoor/industrial-thumb.webp',
    width: 1536, height: 1024, focus: [0.55, 0.7],
    camera: { fov: 70, horizon: 530, yaw: 0, height: 0.9 },
    zones: [
      { id: 'terrace', label: 'Терраса', type: 'terrace', rings: [[[55,592],[400,573],[728,586],[730,600],[916,600],[1048,610],[652,681],[415,660],[220,644],[70,619]]] },
      { id: 'path', label: 'Входная площадка и дорожка', type: 'path', rings: [[[0,794],[100,780],[350,743],[550,710],[650,704],[1048,620],[1144,602],[1375,605],[1375,664],[1348,690],[1467,702],[1458,760],[1448,828],[1536,843],[1536,1024],[0,1024]]] },
    ],
  },
];
export const sceneById = id => SCENES.find(s => s.id === id) || null;
/** Гомография земли для сцены (камера → плоскость). */
export const sceneHomography = scene => cameraHomography({ width: scene.width, height: scene.height, horizon: scene.camera.horizon, yawDeg: scene.camera.yaw, fovDeg: scene.camera.fov, heightM: scene.camera.height });
