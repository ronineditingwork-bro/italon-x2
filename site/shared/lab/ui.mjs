// Разметка лаборатории (общая для страницы /lab/ и для автономного показа): строка HTML, поведение — в app.mjs и catalog-ui.mjs.
import { esc } from '../format.mjs';
import { FORMATS, JOINT_COLORS, BONDS, JOINT_MAX_MM } from './layout.mjs';
import { PRESETS } from './timeofday.mjs';

const I = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  arrow: '<svg viewBox="0 0 26 10" aria-hidden="true"><path d="M0 5h24.5M20 .8 24.6 5 20 9.2"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>',
  beam: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l16 16M4 10l10 10M10 4l10 10"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
  cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2.5l2 11h10l2-8H7"/><circle cx="9" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>',
  close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 1l14 14M15 1 1 15"/></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14"/></svg>',
  film: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6.5" cy="12" r="2"/><circle cx="17" cy="6.5" r="2"/><circle cx="17" cy="17.5" r="2"/><path d="m8.2 11 7-3.4M8.2 13l7 3.4"/></svg>',
};
const seg = (name, items, cur) => `<div class="lab-seg" role="radiogroup" aria-label="${esc(name)}">${items.map(([id, label]) => `<button type="button" role="radio" aria-checked="${id === cur}" data-seg="${esc(name)}" data-value="${esc(id)}">${label}</button>`).join('')}</div>`;
const PRESET_BG = { morning: 'linear-gradient(160deg,#9fb2c4,#d8d2c3 55%,#6d6a62)', day: 'linear-gradient(160deg,#cfe0f2,#efe9dc 55%,#8e8a80)', evening: 'linear-gradient(160deg,#6a3d22,#d08a45 55%,#3a2616)', night: 'linear-gradient(160deg,#0c1426,#26324f 55%,#0a0d16)' };

export const matCard = (m, i, extra = '') => `<button type="button" class="lab-mat" role="radio" aria-checked="false" data-mat="${esc(m.code)}"${extra}><img src="${esc(m.image)}" alt="" width="96" height="96" decoding="async" draggable="false"><span><b>${esc(m.name)}</b><small>арт. ${esc(m.code)}</small></span></button>`;

/** featured: [{ code, name, image, ... }] — витрина; shop — показывать корзину сайта (в автономном показе нет); home — адрес главной. */
export function labMarkup({ featured, shop = true, home = './' }) {
  return `<div class="lab" data-lab data-state="loading">
<canvas class="lab__canvas" data-canvas tabindex="0" role="img" aria-label="Поверхность из плитки. Перетаскивайте, чтобы сдвинуть; колесо или щипок — масштаб; два пальца — поворот. Стрелки — сдвиг, плюс и минус — масштаб."></canvas>
<button type="button" class="lab__orb" data-orb aria-label="Источник света. Перетащите или двигайте стрелками"><span></span></button>
<div class="lab__split" data-split hidden><button type="button" class="lab__split-handle" data-split-handle aria-label="Граница сравнения. Перетащите или двигайте стрелками"><i></i></button></div>
<div class="lab__vig" aria-hidden="true"></div>
<p class="lab__clock" data-clock hidden aria-live="off"></p>

<header class="lab__top">
<a class="lab__back" href="${esc(home)}" aria-label="На сайт Italon X2">${I.back}<span>На сайт</span></a>
<p class="lab__brand"><b>ITALON X2</b><span>MATERIAL LAB</span></p>
${shop ? `<button type="button" class="lab__cart" data-cart-open aria-haspopup="dialog" aria-label="Корзина">${I.cart}<span class="cart-count" data-cart-count aria-hidden="true">0</span></button>` : '<span></span>'}
</header>

<div class="lab-views" role="radiogroup" aria-label="Раздел лаборатории"><button type="button" role="radio" aria-checked="true" data-view="floor">Материалы</button><button type="button" role="radio" aria-checked="false" data-view="slabs">Слэбы 120×278</button></div>
<section class="lab__hero" data-hero aria-labelledby="lab-title">
<h1 id="lab-title">MATERIAL LAB</h1>
<p class="lab__sub">Свет. Фактура. Архитектура.</p>
<p class="lab__lead">Интерактивная лаборатория керамогранита. Управляйте светом, исследуйте фактуру, сравнивайте материалы и создавайте свои интерьерные решения.</p>
<button type="button" class="lab-cta" data-start>Начать исследование ${I.arrow}</button>
</section>

<section class="lab__gallery" data-gallery aria-label="Материалы">
<div class="lab__notice" data-notice hidden><span data-notice-text></span><a data-notice-link href="#">Открыть карточку</a></div>
<div class="lab__gallery-head"><div><h2 data-gallery-title>Выберите материал</h2><p data-gallery-sub>${featured.length} популярных материалов для быстрого старта</p></div><button type="button" class="lab-btn lab-btn--ghost" data-open-catalog><span data-open-label>Все материалы</span> ${I.arrow}</button></div>
<div class="lab__strip" data-strip role="radiogroup" aria-label="Материал">${featured.map((m, i) => matCard(m, i)).join('')}</div>
</section>

<p class="lab__status" data-status role="status" aria-live="polite"></p>

<aside class="lab__panel is-folded" data-panel aria-label="Управление">
<div class="lab__tabs" role="tablist">
${[['light', 'Свет'], ['layout', 'Укладка'], ['compare', 'Сравнить'], ['time', 'Сутки'], ['share', 'Снимок'], ['item', 'Товар']].map(([id, t], i) => `<button type="button" role="tab" id="tab-${id}" aria-controls="pane-${id}" aria-selected="${i === 0}" data-tab="${id}">${t}</button>`).join('')}
<button type="button" class="lab__fold" data-fold aria-label="Свернуть панель" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
</div>
<div class="lab__panes">
<section class="lab__pane" id="pane-light" role="tabpanel" aria-labelledby="tab-light" data-pane="light">
<div class="lab-seg lab-seg--modes" role="radiogroup" aria-label="Режим света">
<button type="button" role="radio" aria-checked="true" data-mode="day">${I.sun}<span>Дневной</span></button>
<button type="button" role="radio" aria-checked="false" data-mode="evening">${I.moon}<span>Вечерний</span></button>
<button type="button" role="radio" aria-checked="false" data-mode="side">${I.beam}<span>Боковой</span></button>
<button type="button" role="radio" aria-checked="false" data-mode="time">${I.clock}<span>Сутки</span></button></div>
<p class="lab__hint" data-mode-hint></p>
<label class="lab-field"><span>Высота света</span><input type="range" min="0.25" max="2.2" step="0.01" value="1" data-height aria-label="Высота света"></label>
<div class="lab__row"><button type="button" class="lab-btn" data-auto aria-pressed="true">${I.pause}<span>Свет движется</span></button><button type="button" class="lab-btn" data-reset>Сбросить вид</button></div>
<div class="lab-seg lab-seg--two" role="radiogroup" aria-label="Что делает палец"><button type="button" role="radio" aria-checked="true" data-drag="move">Двигать</button><button type="button" role="radio" aria-checked="false" data-drag="rotate">Вращать</button></div>
<label class="lab-field"><span>Наклон вида</span><input type="range" min="0" max="1.08" step="0.01" value="0.62" data-tilt aria-label="Наклон вида"></label>
<label class="lab-field"><span>Поворот</span><input type="range" min="-3.14" max="3.14" step="0.01" value="0" data-rot aria-label="Поворот поверхности"></label>
</section>
<section class="lab__pane" id="pane-layout" role="tabpanel" aria-labelledby="tab-layout" data-pane="layout" hidden>
<div data-for="slabs" hidden><p class="lab-label">Плит в стене</p>
<div class="lab-chips" role="radiogroup" aria-label="Число плит">${[1, 2, 3, 4].map(n => `<button type="button" role="radio" aria-checked="${n === 2}" data-slabs="${n}">${n}</button>`).join('')}</div>
<p class="lab__hint">Каждая плита — 120 × 278 см, швы вертикальные. При повороте плиты ложатся горизонтально (до двух в высоту).</p>
<p class="lab__hint lab__hint--note">Показан один рисунок лицевой стороны, повторённый на всех плитах. Книжное зеркалирование (bookmatch) не имитируется: у реальных плит рисунок может отличаться.</p></div>
<div data-for="floor"><p class="lab-label">Формат плитки, см</p>
<div class="lab-chips" role="radiogroup" aria-label="Формат плитки">${FORMATS.map(f => `<button type="button" role="radio" aria-checked="${f.id === '60x60'}" data-format="${f.id}">${f.label}</button>`).join('')}</div></div>
<div class="lab__row"><button type="button" class="lab-btn" data-turn aria-pressed="false"><span data-turn-label>Повернуть на 90°</span></button></div>
<label class="lab-field"><span>Шов, мм <output data-joint-out>2</output></span><input type="range" min="0" max="${JOINT_MAX_MM}" step="0.5" value="2" data-joint aria-label="Ширина шва, миллиметров"></label>
<p class="lab-label">Цвет шва</p>
<div class="lab-swatches" role="radiogroup" aria-label="Цвет шва">${JOINT_COLORS.map((c, i) => `<button type="button" role="radio" aria-checked="${i === 1}" data-jc="${c.id}" title="${esc(c.label)}" aria-label="${esc(c.label)}"><i style="${c.color ? `background:${c.color}` : 'background:linear-gradient(135deg,#8d8a82 50%,#4b4944 50%)'}"></i></button>`).join('')}</div>
<div data-for="floor"><p class="lab-label">Раскладка</p>
${seg('bond', BONDS.map(b => [b.id, b.label]), 'straight')}</div>
</section>
<section class="lab__pane" id="pane-compare" role="tabpanel" aria-labelledby="tab-compare" data-pane="compare" hidden>
<div class="lab__row"><button type="button" class="lab-btn lab-btn--wide" data-compare aria-pressed="false">Сравнить два материала</button></div>
<p class="lab__hint">Слева — выбранный внизу, справа — второй. Тяните линию на экране. Вторым можно взять любую позицию каталога.</p>
<p class="lab-label">Второй материал</p>
<div class="lab-second" data-second-card><img alt="" width="64" height="64" data-second-img><span><b data-second-name>—</b><small data-second-code></small></span><button type="button" class="lab-btn" data-second-open>Выбрать другой</button></div>
<div class="lab-quick" data-second-quick role="radiogroup" aria-label="Быстрый выбор второго материала">${featured.map(m => `<button type="button" role="radio" aria-checked="false" data-second="${esc(m.code)}" title="${esc(m.name)}"><img src="${esc(m.image)}" alt="${esc(m.name)}" width="44" height="44" loading="lazy" decoding="async"></button>`).join('')}</div>
<div class="lab__row"><button type="button" class="lab-btn" data-transition>Переход ▸</button></div>
</section>
<section class="lab__pane" id="pane-time" role="tabpanel" aria-labelledby="tab-time" data-pane="time" hidden>
<p class="lab__hint">Одно помещение с окном: свет и цвет меняются в течение суток. Лампа в комнате — шар света, его можно переносить.</p>
<div class="lab-presets" role="radiogroup" aria-label="Время суток">${PRESETS.map(p => `<button type="button" role="radio" aria-checked="false" data-tpreset="${p.id}" data-at="${p.hour}"><i style="background:${PRESET_BG[p.id]}"></i><b>${p.label}</b><small>${p.hint}</small></button>`).join('')}</div>
<label class="lab-field"><span>Время <output data-hour-out>13:00</output></span><input type="range" min="0" max="24" step="0.05" value="13" data-hour aria-label="Время суток"></label>
<div class="lab__row"><button type="button" class="lab-btn" data-day-play aria-pressed="false">${I.play}<span>Сутки за 14 секунд</span></button></div>
</section>
<section class="lab__pane" id="pane-share" role="tabpanel" aria-labelledby="tab-share" data-pane="share" hidden>
<p class="lab-label">Кадр для публикации</p>
<div class="lab-chips" role="radiogroup" aria-label="Размер кадра"><button type="button" role="radio" aria-checked="true" data-size="story">9:16 · Reels</button><button type="button" role="radio" aria-checked="false" data-size="portrait">4:5</button><button type="button" role="radio" aria-checked="false" data-size="square">1:1</button></div>
<div class="lab-actions">
<button type="button" class="lab-action" data-shot>${I.image}<span><b>Скачать изображение</b><small>JPG, высокое качество</small></span></button>
<button type="button" class="lab-action" data-video>${I.film}<span><b>Скачать видео</b><small data-video-hint>около 7 секунд</small></span></button>
<button type="button" class="lab-action" data-share-link>${I.share}<span><b>Поделиться</b><small data-share-hint>Ссылка на композицию</small></span></button>
</div>
<progress class="lab__progress" data-progress max="1" value="0" hidden></progress>
<p class="lab-label">Качество графики</p>
<div class="lab-seg" role="radiogroup" aria-label="Качество графики"><button type="button" role="radio" aria-checked="true" data-q="auto">Авто</button><button type="button" role="radio" aria-checked="false" data-q="quality">Качество</button><button type="button" role="radio" aria-checked="false" data-q="lite">Лайт</button></div>
<p class="lab__hint" data-perf></p>
</section>
<section class="lab__pane" id="pane-item" role="tabpanel" aria-labelledby="tab-item" data-pane="item" hidden>
<p class="lab-label" data-item-collection></p><h2 class="lab__item-name" data-item-name></h2>
<p class="lab__hint" data-item-meta></p><p class="lab__price" data-item-price></p>
<p class="lab__quality" data-item-quality></p>
<div class="lab__row"><a class="lab-btn lab-btn--solid" data-item-link href="#">Карточка товара</a>${shop ? '<button type="button" class="btn lab-btn lab-btn--add" data-add="" data-item-add>В корзину</button>' : ''}</div>
</section>
</div>
<details class="lab__honest"><summary>Как устроен свет — честно</summary><p>Это <b>художественная модель освещения</b>, а не физически точный замер материала. Цвет и рисунок взяты с фотографии каталога (на ней уже есть свет студии), объёмный рельеф <b>оценён по светлоте снимка</b> и только у фото высокого разрешения, блеск задан по типу отделки, мелкое зерно добавлено программно. У фото низкого разрешения рельеф и зерно не дорисовываются: это упрощённый режим. Реальный оттенок, блеск и рельеф зависят от партии и вашего освещения: окончательный выбор — по образцу в салоне.</p></details>
</aside>

<div class="lab-cat" data-cat hidden role="dialog" aria-modal="true" aria-labelledby="cat-title">
<div class="lab-cat__box">
<header class="lab-cat__head"><div><h2 id="cat-title" data-cat-title>Каталог материалов</h2><p data-cat-sub>Фильтры и поиск по всему каталогу Italon-X2</p></div><button type="button" class="lab-cat__close" data-cat-close aria-label="Закрыть каталог">${I.close}</button></header>
<label class="lab-cat__search">${I.search}<input type="search" id="cat-q" data-cat-q placeholder="Поиск по названию или артикулу…" autocomplete="off" enterkeyhint="search" aria-label="Поиск по названию или артикулу"></label>
<div class="lab-cat__filters">
<label><span>Коллекция</span><select data-f="collection"><option value="">Все</option></select></label>
<label><span>Цвет</span><select data-f="color"><option value="">Все</option></select></label>
<label><span>Фактура</span><select data-f="look"><option value="">Все</option></select></label>
<label><span>Формат</span><select data-f="format"><option value="">Все</option></select></label>
</div>
<div class="lab-cat__bar"><p data-cat-count role="status" aria-live="polite">Загружаю каталог…</p><label>Сортировка <select data-sort><option value="popular">Популярные</option><option value="name">По названию</option><option value="code">По артикулу</option></select></label><button type="button" class="lab-btn lab-btn--ghost" data-f-reset hidden>Сбросить</button></div>
<div class="lab-cat__grid" data-cat-grid></div>
<div class="lab-cat__more" data-cat-more hidden><button type="button" class="lab-btn">Показать ещё</button></div>
</div>
</div>

<div class="lab__modal" data-modal hidden role="dialog" aria-modal="true" aria-labelledby="lab-modal-title"><div class="lab__modal-box"><h2 id="lab-modal-title" data-modal-title>Готово</h2><div data-modal-media></div><p class="lab__hint" data-modal-note></p><div class="lab__row"><a class="lab-btn lab-btn--solid" data-modal-save download href="#">Скачать</a><button type="button" class="lab-btn" data-modal-share hidden>Поделиться</button><button type="button" class="lab-btn" data-modal-close>Закрыть</button></div></div></div>
<noscript><p class="lab__nojs">Лаборатория работает при включённом JavaScript. Каталог — <a href="${esc(home)}catalog/">здесь</a>.</p></noscript>
</div>`;
}
