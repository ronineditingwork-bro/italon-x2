// Разметка лаборатории (общая для страницы /lab/ и для автономного показа): строка HTML, поведение — в app.mjs.
import { esc } from '../format.mjs';
import { FORMATS, JOINT_COLORS, BONDS, JOINT_MAX_MM } from './layout.mjs';

const I = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>',
  beam: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l9 3 9-3M3 12l9 3 9-3M3 18l9 3 9-3" opacity=".0"/><path d="M4 4l16 16M4 10l10 10M10 4l10 10"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
  cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2.5l2 11h10l2-8H7"/><circle cx="9" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/></svg>',
};
const seg = (name, items, cur) => `<div class="lab-seg" role="radiogroup" aria-label="${esc(name)}">${items.map(([id, label]) => `<button type="button" role="radio" aria-checked="${id === cur}" data-seg="${esc(name)}" data-value="${esc(id)}">${label}</button>`).join('')}</div>`;

/** materials: [{ id, name, code, image, collection }]; shop — показывать корзину сайта (на странице сайта да, в автономном показе нет). */
export function labMarkup({ materials, shop = true, home = './' }) {
  return `<div class="lab" data-lab data-state="loading">
<canvas class="lab__canvas" data-canvas tabindex="0" role="img" aria-label="Поверхность из плитки. Перетаскивайте, чтобы сдвинуть; колесо или щипок — масштаб; два пальца — поворот. Стрелки — сдвиг, плюс и минус — масштаб."></canvas>
<button type="button" class="lab__orb" data-orb aria-label="Источник света. Перетащите или двигайте стрелками"><span></span></button>
<div class="lab__split" data-split hidden><button type="button" class="lab__split-handle" data-split-handle aria-label="Граница сравнения. Перетащите или двигайте стрелками"><i></i></button></div>
<div class="lab__vig" aria-hidden="true"></div>

<header class="lab__top">
<a class="lab__back" href="${esc(home)}" aria-label="На сайт Italon X2">${I.back}<span>На сайт</span></a>
<p class="lab__brand"><b>ITALON X2</b><span>MATERIAL LAB</span></p>
${shop ? `<button type="button" class="lab__cart" data-cart-open aria-haspopup="dialog" aria-label="Корзина">${I.cart}<span class="cart-count" data-cart-count aria-hidden="true">0</span></button>` : '<span></span>'}
</header>

<div class="lab__headline" data-headline><h1>Плитка оживает<br>под управляемым светом</h1><p>Двигайте свет, меняйте раскладку, сравнивайте материалы.</p></div>

<div class="lab__dock" role="radiogroup" aria-label="Материал">${materials.map((m, i) => `<button type="button" class="lab-mat" role="radio" aria-checked="${i === 0}" data-mat="${i}"><img src="${esc(m.image)}" alt="" width="56" height="56" decoding="async"><span><b>${esc(m.name)}</b><small>арт. ${esc(m.code)}</small></span></button>`).join('')}</div>

<p class="lab__status" data-status role="status" aria-live="polite"></p>

<aside class="lab__panel" data-panel aria-label="Управление">
<div class="lab__tabs" role="tablist">
${[['light', 'Свет'], ['layout', 'Укладка'], ['compare', 'Сравнить'], ['share', 'Снимок'], ['item', 'Товар']].map(([id, t], i) => `<button type="button" role="tab" id="tab-${id}" aria-controls="pane-${id}" aria-selected="${i === 0}" data-tab="${id}">${t}</button>`).join('')}
<button type="button" class="lab__fold" data-fold aria-label="Свернуть панель" aria-expanded="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
</div>
<div class="lab__panes">
<section class="lab__pane" id="pane-light" role="tabpanel" aria-labelledby="tab-light" data-pane="light">
<div class="lab-seg lab-seg--modes" role="radiogroup" aria-label="Режим света">
<button type="button" role="radio" aria-checked="true" data-mode="day">${I.sun}<span>Дневной</span></button>
<button type="button" role="radio" aria-checked="false" data-mode="evening">${I.moon}<span>Вечерний</span></button>
<button type="button" role="radio" aria-checked="false" data-mode="side">${I.beam}<span>Боковой</span></button></div>
<p class="lab__hint" data-mode-hint></p>
<label class="lab-field"><span>Высота света</span><input type="range" min="0.25" max="2.2" step="0.01" value="1" data-height aria-label="Высота света"></label>
<div class="lab__row"><button type="button" class="lab-btn" data-auto aria-pressed="true">${I.pause}<span>Свет движется</span></button><button type="button" class="lab-btn" data-reset>Сбросить вид</button></div>
<div class="lab-seg lab-seg--two" role="radiogroup" aria-label="Что делает палец"><button type="button" role="radio" aria-checked="true" data-drag="move">Двигать</button><button type="button" role="radio" aria-checked="false" data-drag="rotate">Вращать</button></div>
<label class="lab-field"><span>Наклон вида</span><input type="range" min="0" max="1.08" step="0.01" value="0.62" data-tilt aria-label="Наклон вида"></label>
<label class="lab-field"><span>Поворот</span><input type="range" min="-3.14" max="3.14" step="0.01" value="0" data-rot aria-label="Поворот поверхности"></label>
</section>
<section class="lab__pane" id="pane-layout" role="tabpanel" aria-labelledby="tab-layout" data-pane="layout" hidden>
<p class="lab-label">Формат плитки, см</p>
<div class="lab-chips" role="radiogroup" aria-label="Формат плитки">${FORMATS.map((f, i) => `<button type="button" role="radio" aria-checked="${f.id === '60x60'}" data-format="${f.id}">${f.label}</button>`).join('')}</div>
<div class="lab__row"><button type="button" class="lab-btn" data-turn aria-pressed="false">Повернуть на 90°</button></div>
<label class="lab-field"><span>Шов, мм <output data-joint-out>2</output></span><input type="range" min="0" max="${JOINT_MAX_MM}" step="0.5" value="2" data-joint aria-label="Ширина шва, миллиметров"></label>
<p class="lab-label">Цвет шва</p>
<div class="lab-swatches" role="radiogroup" aria-label="Цвет шва">${JOINT_COLORS.map((c, i) => `<button type="button" role="radio" aria-checked="${i === 1}" data-jc="${c.id}" title="${esc(c.label)}" aria-label="${esc(c.label)}"><i style="${c.color ? `background:${c.color}` : 'background:linear-gradient(135deg,#8d8a82 50%,#4b4944 50%)'}"></i></button>`).join('')}</div>
<p class="lab-label">Раскладка</p>
${seg('bond', BONDS.map(b => [b.id, b.label]), 'straight')}
</section>
<section class="lab__pane" id="pane-compare" role="tabpanel" aria-labelledby="tab-compare" data-pane="compare" hidden>
<div class="lab__row"><button type="button" class="lab-btn lab-btn--wide" data-compare aria-pressed="false">Сравнить два материала</button></div>
<p class="lab__hint">Слева — выбранный внизу, справа — второй. Тяните линию на экране. Кнопка «Переход» проводит световую шторку к соседнему материалу.</p>
<p class="lab-label">Второй материал</p>
<div class="lab-chips" role="radiogroup" aria-label="Второй материал">${materials.map((m, i) => `<button type="button" role="radio" aria-checked="${i === 1}" data-second="${i}">${esc(m.name)}</button>`).join('')}</div>
<div class="lab__row"><button type="button" class="lab-btn" data-transition>Переход ▸</button></div>
</section>
<section class="lab__pane" id="pane-share" role="tabpanel" aria-labelledby="tab-share" data-pane="share" hidden>
<p class="lab-label">Кадр для публикации</p>
<div class="lab-chips" role="radiogroup" aria-label="Размер кадра"><button type="button" role="radio" aria-checked="true" data-size="story">9:16 · Reels</button><button type="button" role="radio" aria-checked="false" data-size="portrait">4:5</button><button type="button" role="radio" aria-checked="false" data-size="square">1:1</button></div>
<div class="lab__row"><button type="button" class="lab-btn lab-btn--solid" data-shot>Сохранить снимок</button><button type="button" class="lab-btn lab-btn--solid" data-video>Записать ролик</button></div>
<p class="lab__hint" data-video-hint></p>
<progress class="lab__progress" data-progress max="1" value="0" hidden></progress>
<p class="lab-label">Качество графики</p>
<div class="lab-seg" role="radiogroup" aria-label="Качество графики"><button type="button" role="radio" aria-checked="true" data-q="auto">Авто</button><button type="button" role="radio" aria-checked="false" data-q="quality">Качество</button><button type="button" role="radio" aria-checked="false" data-q="lite">Лайт</button></div>
<p class="lab__hint" data-perf></p>
</section>
<section class="lab__pane" id="pane-item" role="tabpanel" aria-labelledby="tab-item" data-pane="item" hidden>
<p class="lab-label" data-item-collection></p><h2 class="lab__item-name" data-item-name></h2>
<p class="lab__hint" data-item-meta></p><p class="lab__price" data-item-price></p>
<div class="lab__row"><a class="lab-btn lab-btn--solid" data-item-link href="#">Карточка товара</a>${shop ? '<button type="button" class="btn lab-btn lab-btn--add" data-add="" data-item-add>В корзину</button>' : ''}</div>
</section>
</div>
<details class="lab__honest"><summary>Как устроен свет — честно</summary><p>Это <b>художественная модель освещения</b>, а не физически точный замер материала. Цвет и рисунок взяты с фотографии каталога (на ней уже есть свет студии), объёмный рельеф <b>оценён по светлоте снимка</b>, блеск задан по типу отделки, мелкое зерно добавлено программно. Реальный оттенок, блеск и рельеф зависят от партии и вашего освещения: окончательный выбор — по образцу в салоне.</p></details>
</aside>

<div class="lab__modal" data-modal hidden role="dialog" aria-modal="true" aria-labelledby="lab-modal-title"><div class="lab__modal-box"><h2 id="lab-modal-title" data-modal-title>Готово</h2><div data-modal-media></div><p class="lab__hint" data-modal-note></p><div class="lab__row"><a class="lab-btn lab-btn--solid" data-modal-save download href="#">Скачать</a><button type="button" class="lab-btn" data-modal-share hidden>Поделиться</button><button type="button" class="lab-btn" data-modal-close>Закрыть</button></div></div></div>
<noscript><p class="lab__nojs">Лаборатория работает при включённом JavaScript. Каталог — <a href="${esc(home)}catalog/">здесь</a>.</p></noscript>
</div>`;
}
