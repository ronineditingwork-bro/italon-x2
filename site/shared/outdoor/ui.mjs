// X2 Outdoor Lab: разметка страницы (общая для сборки и тестов). Поведение — app.mjs (сцены) и plot.mjs («Мой участок»).
import { esc } from '../format.mjs';

const I = {
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6.5" cy="12" r="2"/><circle cx="17" cy="6.5" r="2"/><circle cx="17" cy="17.5" r="2"/><path d="m8.2 11 7-3.4M8.2 13l7 3.4"/></svg>',
  cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2.5l2 11h10l2-8H7"/><circle cx="9" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>',
  close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 1l14 14M15 1 1 15"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="1"/><path d="m4 16 4.5-4.5 3.5 3.5 3-3 5 5"/><circle cx="9" cy="9.5" r="1.2"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4.5 11.5 9 16M5 11.5h9a5 5 0 0 1 0 10h-3"/></svg>',
  split: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="1"/><path d="M12 5v14"/></svg>',
  arrow: '<svg viewBox="0 0 26 10" aria-hidden="true"><path d="M0 5h24.5M20 .8 24.6 5 20 9.2"/></svg>',
};
export const ICONS = I;

const step = (n, title, body, attrs = '') => `<section class="ol-step" ${attrs}><h2 class="ol-step__title"><span class="ol-step__n" aria-hidden="true">${n}</span>${esc(title)}</h2>${body}</section>`;

/**
 * scenes: [{ id, title, short, city, thumb, width, height }] (публичные поля сцен); root — относительный путь к корню сайта.
 * Динамические части (зоны, материалы, настройки) рисует app.mjs в контейнеры с data-… .
 */
export function outdoorMarkup({ scenes, root = './' }) {
  const sceneCards = scenes.map((s, i) => `<button type="button" class="ol-scene" data-scene="${esc(s.id)}" aria-pressed="${i === 0}"><img src="${esc(root + s.thumb)}" alt="" width="320" height="213" loading="${i < 3 ? 'eager' : 'lazy'}" decoding="async"><span>${esc(s.short)}</span></button>`).join('');
  const more = scenes.map(s => `<button type="button" class="ol-more__card" data-scene="${esc(s.id)}"><img src="${esc(root + s.thumb)}" alt="" width="320" height="213" loading="lazy" decoding="async"><span><b>${esc(s.title)}</b><small>${esc(s.city)}</small></span></button>`).join('');
  return `<section class="ol" data-ol data-mode="scene" data-state="loading" aria-labelledby="ol-title">
<div class="ol__layout">
<aside class="ol__panel" data-panel aria-label="Настройки визуализации">
<div class="ol-modes" role="tablist" aria-label="Режим">
<button type="button" role="tab" id="ol-tab-scene" aria-selected="true" aria-controls="ol-pane-scene" data-mode-tab="scene">Готовые сцены</button>
<button type="button" role="tab" id="ol-tab-plot" aria-selected="false" aria-controls="ol-pane-plot" data-mode-tab="plot">${I.camera}<span>Мой участок</span></button>
</div>
<div id="ol-pane-scene" role="tabpanel" aria-labelledby="ol-tab-scene" data-pane="scene">
${step(1, 'Выберите сцену', `<div class="ol-scenes" data-scenes>${sceneCards}</div>`)}
${step(2, 'Выберите зону', '<div class="ol-zones" data-zones role="radiogroup" aria-label="Зона покрытия"></div><p class="ol-hint" data-zone-hint></p>')}
</div>
<div id="ol-pane-plot" role="tabpanel" aria-labelledby="ol-tab-plot" data-pane="plot" hidden data-plot-pane></div>
${step(3, 'Материал X2', `<div class="ol-material" data-material-card></div>
<div class="ol-row"><button type="button" class="ol-btn ol-btn--line" data-open-materials>${I.search}<span>Все материалы</span></button></div>
<div class="ol-strip" data-material-strip role="radiogroup" aria-label="Быстрый выбор материала"></div>`)}
${step(4, 'Формат', '<div class="ol-chips" data-group="format" role="radiogroup" aria-label="Формат"></div>')}
${step(5, 'Способ укладки', '<div class="ol-cards" data-group="mount" role="radiogroup" aria-label="Способ укладки"></div><p class="ol-hint" data-mount-hint></p>')}
${step(6, 'Раскладка', '<div class="ol-chips" data-group="layout" role="radiogroup" aria-label="Раскладка"></div><div class="ol-chips" data-group="direction" role="radiogroup" aria-label="Направление плитки"></div><p class="ol-hint" data-layout-hint></p>')}
${step(7, 'Шов', '<div class="ol-chips ol-chips--joints" data-group="joint" role="radiogroup" aria-label="Шов"></div>')}
<label class="ol-sync" data-sync-row><input type="checkbox" data-sync checked><span>Одинаково для всех зон</span></label>
</aside>
<div class="ol__main">
<div class="ol__stage" data-stage>
<canvas class="ol__canvas" data-canvas tabindex="0" role="img" aria-label="Визуализация: плитка X2 на выбранной поверхности. Перетаскивайте, чтобы сдвинуть кадр; нажмите на поверхность, чтобы выбрать зону."></canvas>
<canvas class="ol__overlay" data-overlay aria-hidden="true"></canvas>
<div class="ol__split" data-split hidden><button type="button" class="ol__split-handle" data-split-handle aria-label="Граница сравнения. Перетащите или двигайте стрелками"><i></i></button><span class="ol__split-l" data-split-l></span><span class="ol__split-r" data-split-r></span></div>
<div class="ol__title"><p class="ol__kicker">OUTDOOR LAB</p><h1 id="ol-title">Визуализируйте уличное пространство с Italon X2</h1><p class="ol__lead">Выбирайте дом, зону, материал и способ укладки — плитка ложится на настоящую перспективу, в масштабе и с тенями.</p></div>
<div class="ol__tools" role="toolbar" aria-label="Инструменты">
<button type="button" class="ol-tool" data-compare="before" aria-pressed="false" title="Сравнить с исходным видом">${I.split}<span>До / После</span></button>
<button type="button" class="ol-tool" data-compare="ab" aria-pressed="false" title="Сравнить два материала">${I.split}<span>A / B</span></button>
<button type="button" class="ol-tool ol-tool--icon" data-zoom="1" aria-label="Приблизить">${I.plus}</button>
<button type="button" class="ol-tool ol-tool--icon" data-zoom="-1" aria-label="Отдалить">${I.minus}</button>
<button type="button" class="ol-tool ol-tool--icon" data-fullscreen aria-label="Во весь экран">${I.expand}</button>
</div>
<div class="ol__chips" data-stage-zones></div>
<p class="ol__status" data-status role="status" aria-live="polite"></p>
</div>
<div class="ol-summary" data-summary aria-live="polite"></div>
</div>
</div>
<section class="ol-more" aria-labelledby="ol-more-title"><h2 id="ol-more-title">Другие сцены</h2><div class="ol-more__row" data-scenes-more>${more}</div></section>
<section class="ol-lay" aria-labelledby="ol-lay-title"><h2 id="ol-lay-title">Способы укладки</h2><div class="ol-lay__row" data-laying></div></section>
<p class="ol-fine">Визуализация приблизительна: цвет зависит от экрана и освещения, масштаб — по оценке камеры сцены, площадь — ориентировочная. Точный расчёт и образцы — в салоне Italon Experience.</p>
<dialog class="ol-dialog" data-materials-dialog aria-labelledby="ol-mat-title">
<div class="ol-dialog__head"><h2 id="ol-mat-title">Материалы X2 для улицы</h2><button type="button" class="ol-tool ol-tool--icon" data-dialog-close aria-label="Закрыть">${I.close}</button></div>
<div class="ol-dialog__tools"><label class="ol-search">${I.search}<input type="search" data-material-search placeholder="Название, цвет или артикул" aria-label="Поиск материала" autocomplete="off"></label><div class="ol-chips" data-collections role="radiogroup" aria-label="Коллекция"></div></div>
<div class="ol-dialog__grid" data-material-grid></div>
<p class="ol-dialog__empty" data-material-empty hidden>Ничего не найдено. Попробуйте название коллекции или артикул.</p>
</dialog>
</section>`;
}
