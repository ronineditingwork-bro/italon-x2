// «Архитектурная машина времени»: одно помещение с окном в течение суток. Чистые функции от часа (0–24): направление и цвет солнца или луны,
// свет неба, лампа, свечение окна. Это художественная модель суток, а не астрономический расчёт для конкретного места и даты.
const clamp01 = x => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const norm3 = v => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export const WORLD = { wallY: 150, wallH: 280, winHalfW: 70, winZ0: 25, winZ1: 195, winZMid: 120, mullion: 5 };   // см, комната перед стеной с окном
export const PRESETS = [
  { id: 'morning', label: 'Утро', hint: 'Мягкий дневной свет', hour: 8 },
  { id: 'day', label: 'День', hint: 'Яркий нейтральный свет', hour: 13 },
  { id: 'evening', label: 'Вечер', hint: 'Тёплый искусственный свет', hour: 19.5 },
  { id: 'night', label: 'Ночь', hint: 'Направленный боковой свет', hour: 23 },
];
export const formatHour = h => { const t = ((h % 24) + 24) % 24, hh = Math.floor(t), mm = Math.round((t - hh) * 60); return `${String(mm === 60 ? (hh + 1) % 24 : hh).padStart(2, '0')}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`; };
export const presetOf = h => { const t = ((h % 24) + 24) % 24; return t >= 6.5 && t < 11 ? 'morning' : t >= 11 && t < 17 ? 'day' : t >= 17 && t < 21 ? 'evening' : 'night'; };

// ключевые кадры света неба (линейный RGB, уже с яркостью) по часам; между ними плавная интерполяция, сутки замкнуты
const SKY = [
  [0, [0.020, 0.030, 0.070]], [5, [0.022, 0.032, 0.072]], [6.5, [0.20, 0.17, 0.20]], [8, [0.42, 0.50, 0.62]], [12, [0.62, 0.74, 0.96]], [16, [0.56, 0.66, 0.86]],
  [18, [0.36, 0.28, 0.30]], [19.5, [0.14, 0.12, 0.20]], [21, [0.04, 0.05, 0.11]], [24, [0.020, 0.030, 0.070]],
];
const GLOW = [   // цвет самого окна (небо за стеклом)
  [0, [0.02, 0.04, 0.12]], [5, [0.03, 0.05, 0.14]], [6.5, [0.95, 0.55, 0.38]], [8, [0.85, 0.92, 1.1]], [12, [1.5, 1.8, 2.3]], [16, [1.3, 1.5, 1.9]],
  [18, [1.2, 0.55, 0.30]], [19.5, [0.25, 0.14, 0.26]], [21, [0.04, 0.07, 0.18]], [24, [0.02, 0.04, 0.12]],
];
const keyed = (tab, h) => { for (let i = 1; i < tab.length; i++) if (h <= tab[i][0]) { const [h0, c0] = tab[i - 1], [h1, c1] = tab[i]; return mix3(c0, c1, smooth(0, 1, (h - h0) / (h1 - h0))); } return tab[tab.length - 1][1]; };

/** Освещение комнаты в час h. Возвращает { sunDir, sunCol, amb, lamp, glow, exposure, key: 'sun'|'moon' } — всё готово для шейдера. */
export function skyAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  const dayK = smooth(6.3, 7.6, h) * (1 - smooth(16.8, 18.0, h)), frac = clamp01((h - 6.5) / 11), el = (4 + 62 * Math.sin(Math.PI * frac)) * Math.PI / 180;
  const az = Math.PI * (0.82 - 0.64 * frac);        // утром свет приходит слева от окна, днём — прямо, к вечеру — справа
  const sunDir = norm3([Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el)]);
  const elk = Math.sin(Math.PI * frac), warm = [1.0, 0.60, 0.34], white = [1.0, 0.96, 0.90];
  const sunI = dayK * (0.55 + 0.75 * Math.sqrt(elk)) * 2.1, sunCol = mix3(warm, white, Math.sqrt(clamp01(elk * 1.6))).map(v => v * sunI);
  const moonK = smooth(19.6, 21.2, h < 12 ? h + 24 : h) * (h < 12 ? 1 - smooth(4.8, 6.2, h) : 1);
  const moonDir = norm3([0.30, 0.62, 0.52]), moonCol = [0.50, 0.64, 1.0].map(v => v * 0.42 * moonK);
  const lampK = h < 7.4 ? 0.14 * (1 - smooth(5.5, 7.4, h)) : smooth(16.0, 19.6, h) * (1 - smooth(21.0, 23.0, h) * 0.86);
  const lamp = [1.0, 0.62, 0.33].map(v => v * 3.4 * Math.min(1, lampK));
  const key = dayK > 0.02 ? 'sun' : 'moon';
  const amb = keyed(SKY, h), glow = keyed(GLOW, h);
  const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const total = lum(key === 'sun' ? sunCol : moonCol) * 0.4 + lum(amb) + lum(lamp) * 0.35;
  const exposure = Math.min(1.7, Math.max(0.8, 1.1 / Math.max(0.35, Math.sqrt(total))));   // «глаз привыкает»: тёмная сцена подсвечивается сильнее
  return { hour: h, key, sunDir: key === 'sun' ? sunDir : moonDir, sunCol: key === 'sun' ? sunCol : moonCol, amb, lamp, glow, exposure };
}
/** Сутки за duration секунд: час на момент t (для кнопки «Сутки» и ролика). */
export const hourAt = (t, duration, from = 6.5, to = 23.5) => lerp(from, to, easeInOut(clamp01(t / duration)));
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
/** Положение камеры «вид на комнату». */
export const ROOM_CAM = { center: [0, 42], rot: 0, tilt: 0.98, ppcm: 3.2 };
