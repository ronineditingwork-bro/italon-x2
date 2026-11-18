// Бассейн Lab: разметка страницы на компонентах Outdoor Lab (классы ol-*, стили outdoor.css + pool.css). Поведение — app.mjs.
import { esc } from '../format.mjs';
import { ICONS as I } from '../outdoor/ui.mjs';
import { POOL_TYPES } from './model.mjs';

const step = (n, title, body, attrs = '') => `<section class="ol-step" ${attrs}><h2 class="ol-step__title"><span class="ol-step__n" aria-hidden="true">${n}</span>${esc(title)}</h2>${body}</section>`;

/** scenes: { id: { label, pool, layers } } из data/pool-lab-scene.json; root — относительный путь к корню сайта. */
export function poolMarkup({ scenes, root = './' }) {
  const list = Object.entries(scenes);
  const thumb = id => `${root}media/pool-lab/${id}-thumb.webp`;
  const sub = s => `${POOL_TYPES[s.pool.type]} · ${String(s.pool.length).replace('.', ',')} × ${String(s.pool.width).replace('.', ',')} м${s.layers.pool ? ' · день и вечер' : ''}`;
  const cards = list.map(([id, s], i) => `<button type="button" class="ol-scene" data-scene="${esc(id)}" aria-pressed="${i === 0}"><img src="${esc(thumb(id))}" alt="" width="320" height="213" loading="eager" decoding="async"><span>${esc(s.label)}</span></button>`).join('');
  const more = list.map(([id, s]) => `<button type="button" class="ol-more__card" data-scene="${esc(id)}"><img src="${esc(thumb(id))}" alt="" width="320" height="213" loading="lazy" decoding="async"><span><b>${esc(s.label)}</b><small>${esc(sub(s))}</small></span></button>`).join('');
  return `<section class="ol pl" data-pl data-state="loading" aria-labelledby="pl-title">
<div class="ol__layout">
<aside class="ol__panel" data-panel aria-label="Настройки бассейна">
${step(1, 'Выберите сцену', `<div class="ol-scenes" data-scenes>${cards}</div>`)}
${step(2, 'Время суток', '<div class="ol-chips" data-group="light" role="radiogroup" aria-label="Время суток"></div><p class="ol-hint" data-light-hint></p>', 'data-light-step')}
${step(3, 'Выберите поверхность', '<div class="ol-zones" data-zones role="radiogroup" aria-label="Поверхность"></div><p class="ol-hint">Нажмите на поверхность в кадре — она выберется сама.</p>')}
${step(4, 'Материал', `<div class="ol-material" data-material-card></div>
<div class="pl-collections" data-material-groups></div>`)}
${step(5, 'Раскладка', '<div class="ol-chips" data-group="layout" role="radiogroup" aria-label="Раскладка"></div><p class="ol-hint" data-layout-hint></p>')}
${step(6, 'Затирка', '<div class="ol-chips" data-group="grout" role="radiogroup" aria-label="Цвет затирки"></div>')}
</aside>
<div class="ol__main">
<div class="ol__stage pl__stage" data-stage>
<canvas class="ol__canvas" data-canvas tabindex="0" role="img" aria-label="Визуализация бассейна с выбранной плиткой. Нажмите на поверхность, чтобы выбрать её материал."></canvas>
<div class="ol__title"><p class="ol__kicker">БАССЕЙН LAB</p><h1 id="pl-title">Подберите плитку для бассейна и террасы</h1><p class="ol__lead">Italon в чаше, X2 20 мм на террасе и бортике. Свет, тени и вода остаются как на снимке, цвет воды меняется вместе с плиткой.</p></div>
<div class="ol__tools" role="toolbar" aria-label="Инструменты">
<button type="button" class="ol-tool ol-tool--icon" data-fullscreen aria-label="Во весь экран" aria-pressed="false">${I.expand}</button>
</div>
<div class="ol__chips" data-stage-zones></div>
<p class="ol__status" data-status role="status" aria-live="polite"></p>
</div>
<div class="ol-summary" data-summary aria-live="polite"></div>
</div>
</div>
<section class="ol-more" aria-labelledby="pl-more-title"><h2 id="pl-more-title">Другие сцены</h2><div class="ol-more__row" data-scenes-more>${more}</div></section>
<p class="ol-fine">Визуализация приблизительна: цвет зависит от экрана и освещения, рисунок плитки на сцене — по фото каталога или скану ARCHITALON того же цвета. Площадь чаши — дно и стены прямоугольного бассейна, ступени покрывает запас 10 %. Точный расчёт и образцы — в салоне Italon Experience.</p>
</section>`;
}
