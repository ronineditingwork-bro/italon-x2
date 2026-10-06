// Общий каркас всех страниц: <head>, шапка, мобильное меню, поиск, подвал, диалоги.
// Страница отдаёт только содержимое <main>; см. site/README.md → «Как добавить страницу».
import { esc, CLOSE, CART_ICON } from './shared/format.mjs';
import { nav, salon, priceNote } from './data.mjs';

/** Встроенный загрузчик: классы на <html> до первой отрисовки (без мигания).
 *  js — JS включён; reveal — можно прятать [data-reveal] до появления (нет reduced-motion);
 *  page-fade — мягкий fade при загрузке, если нет View Transitions.
 *  Если main.js не отметился (motion-ready) за 3 с, reveal снимается — контент виден. */
const BOOT = `(function(d,w){var h=d.documentElement;h.classList.remove('no-js');h.classList.add('js');
if(w.matchMedia&&w.matchMedia('(prefers-reduced-motion: reduce)').matches){h.classList.add('reduced');return;}
h.classList.add('reveal');if(!('onpagereveal' in w))h.classList.add('page-fade');
setTimeout(function(){if(!h.classList.contains('motion-ready'))h.classList.remove('reveal');},3000);
})(document,window);`;

/** Для 404: страница отдаётся по любому адресу, корень вычисляется по адресу (корень домена или /<repo>/). */
const BASE_404 = `(function(){var m=location.pathname.match(/^\\/[^/]+-x2\\//);document.write('<base href="'+(m?m[0]:'/')+'">');})();`;

const ICON = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7h17M3.5 12h17M3.5 17h17"/></svg>',
};

/** Логотип-знак «ITALON | X²». */
export function logo() {
  return `<span>ITALON</span><span class="logo__rule" aria-hidden="true"></span><span class="logo__x">X<sup>2</sup></span>`;
}

function header(ctx) {
  const links = nav.map(item => `<a href="${ctx.url(item.path)}"${ctx.isCurrent(item.path) ? ' aria-current="page"' : ''}>${esc(item.label)}</a>`).join('');
  return `<header class="site-header">
<div class="wrap site-header__inner">
<a class="logo" href="${ctx.url('/')}" aria-label="Italon Experience — на главную">${logo()}</a>
<nav class="site-nav" aria-label="Основная навигация">${links}</nav>
<div class="header-actions">
<a class="icon-btn" href="${ctx.url('/catalog/')}" data-search-open aria-label="Поиск по каталогу">${ICON.search}</a>
<a class="header-link header-link--salon" href="${ctx.url('/salon/')}">${ICON.pin}<span class="label-text">Салон</span></a>
<button type="button" class="icon-btn" data-cart-open aria-haspopup="dialog" aria-label="Корзина">${CART_ICON}<span class="cart-count" data-cart-count aria-hidden="true">0</span></button>
<button type="button" class="icon-btn menu-btn" data-menu-open aria-haspopup="dialog" aria-controls="site-menu" aria-label="Открыть меню">${ICON.menu}</button>
</div>
</div>
</header>`;
}

function menu(ctx) {
  return `<dialog class="menu" id="site-menu" aria-label="Меню">
<div class="menu__inner">
<div class="menu__top"><a class="logo" href="${ctx.url('/')}" aria-label="На главную">${logo()}</a>
<button type="button" class="icon-btn" data-dialog-close aria-label="Закрыть меню"><svg viewBox="0 0 16 16" aria-hidden="true" style="width:1rem;height:1rem;fill:none;stroke:currentColor;stroke-width:1.4">${CLOSE.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg></button></div>
<ul class="menu__list" role="list">${[{ path: '/', label: 'Главная' }, ...nav].map(item => `<li><a href="${ctx.url(item.path)}"${ctx.isCurrent(item.path) ? ' aria-current="page"' : ''}>${esc(item.label)}</a></li>`).join('')}
<li><a href="${ctx.url('/catalog/')}" data-search-open>Поиск по каталогу <span>${ICON.search.replace('<svg', '<svg style="width:1.25rem;height:1.25rem;fill:none;stroke:currentColor;stroke-width:1.4"')}</span></a></li></ul>
<div class="menu__contacts"><address>${esc(salon.address).replace(/, (\d+)$/, ',&nbsp;$1')}</address><span>${salon.hours.map(([d, t]) => `${esc(d)}: ${esc(t)}`).join(' · ')}</span><a href="${salon.phoneHref}">${esc(salon.phone)}</a></div>
</div>
</dialog>`;
}

function search(ctx) {
  return `<dialog class="search-dialog" id="search-dialog" aria-label="Поиск по каталогу">
<div class="wrap search-dialog__inner">
<form class="search-dialog__bar" action="${ctx.url('/catalog/')}" method="get" role="search">${ICON.search}
<label class="sr-only" for="search-input">Название, цвет или артикул</label>
<input class="search-dialog__input" id="search-input" name="q" type="search" placeholder="Название, цвет или артикул" autocomplete="off" enterkeyhint="search">
<button type="button" class="icon-btn" data-dialog-close aria-label="Закрыть поиск"><svg viewBox="0 0 16 16" aria-hidden="true" style="width:1rem;height:1rem;fill:none;stroke:currentColor;stroke-width:1.4">${CLOSE.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg></button>
</form>
<p class="sr-only" id="search-status" role="status" aria-live="polite"></p>
<ul class="search-results" id="search-results" role="list"></ul>
<div class="search-dialog__foot"><span>Поиск по 993 позициям прайса Italon и X2</span><a class="link-arrow" id="search-all" href="${ctx.url('/catalog/')}">Все результаты в каталоге</a></div>
</div>
</dialog>`;
}

function footer(ctx) {
  const u = p => ctx.url(p);
  return `<footer class="site-footer on-dark">
<div class="wrap">
<div class="footer-grid">
<div class="footer-brand"><a class="logo" href="${u('/')}" aria-label="Italon Experience — на главную">${logo()}</a>
<p>Салон Italon Experience в Краснодаре. Керамогранит и плитка Italon, X2 20&nbsp;мм для открытых пространств.</p></div>
<nav class="footer-col" aria-labelledby="f-catalog"><h2 id="f-catalog">Каталог</h2>
<a href="${u('/collections/')}">Коллекции</a><a href="${u('/x2/')}">X2 · улица</a><a href="${u('/catalog/')}">Все позиции</a><a href="${u('/catalog/')}?category=mosaic">Мозаика</a></nav>
<nav class="footer-col" aria-labelledby="f-clients"><h2 id="f-clients">Клиентам</h2>
<a href="${u('/calculator/')}">Калькулятор упаковок</a><a href="${u('/catalog/')}" data-cart-open>Корзина и КП в PDF</a><a href="${u('/inspiration/')}">Вдохновение</a></nav>
<nav class="footer-col" aria-labelledby="f-brand"><h2 id="f-brand">О бренде</h2>
<a href="${u('/salon/')}">Салон Italon Experience</a><a href="${u('/collections/')}">Коллекции Italon</a><a href="${u('/x2/')}">X2 — 20 мм</a></nav>
<div class="footer-col"><h2>Контакты</h2>
<address>${esc(salon.address).replace(/, (\d+)$/, ',&nbsp;$1')}</address>${salon.hours.map(([d, t]) => `<span>${esc(d)}: ${esc(t)}</span>`).join('')}
<a href="${salon.phoneHref}">${esc(salon.phone)}</a><a href="mailto:${salon.email}">${esc(salon.email)}</a></div>
</div>
<div class="footer-bottom"><span>© Italon Experience, Краснодар</span><span>${esc(priceNote)}. Сайт не принимает оплату.</span></div>
</div>
</footer>`;
}

function dialogs() {
  const close = label => `<button type="button" class="dialog__close" data-dialog-close aria-label="${label}">${CLOSE}</button>`;
  return `<dialog class="dialog" id="product-dialog" aria-labelledby="product-dialog-title">${close('Закрыть карточку')}<div class="dialog__scroll" id="product-dialog-body"></div></dialog>
<dialog class="dialog dialog--photo" id="photo-dialog" aria-labelledby="photo-dialog-title">${close('Закрыть фото')}<div class="dialog__scroll" id="photo-dialog-body"></div></dialog>
<dialog class="dialog dialog--side" id="cart-dialog" aria-labelledby="cart-dialog-title">${close('Закрыть корзину')}
<div class="dialog__scroll">
<div class="dialog__head"><p class="eyebrow">Ваш проект</p><h2 class="dialog__title" id="cart-dialog-title">Корзина</h2></div>
<p class="cart-status" id="cart-status" role="status"></p>
<div class="cart-error" id="cart-error" role="alert" hidden><span></span><button type="button" class="btn btn--small btn--outline" id="cart-retry">Повторить</button></div>
<div class="cart-list" id="cart-list"></div>
<div class="cart-summary">
<div class="cart-total"><span class="t-muted">Итого с НДС</span><strong id="cart-total">0 ₽</strong></div>
<form class="quote-form" id="quote-form" novalidate>
<h3 class="t-h4">Коммерческое предложение в PDF</h3>
<label class="field"><span class="field__label">Телефон для связи <small>обязательно</small></span><input class="input" id="quote-phone" type="tel" inputmode="tel" maxlength="30" placeholder="+7 900 000-00-00" autocomplete="tel" required></label>
<label class="field"><span class="field__label">Получатель <small>необязательно</small></span><input class="input" id="quote-customer" maxlength="100" placeholder="Имя или компания" autocomplete="off"></label>
<label class="field"><span class="field__label">Объект <small>необязательно</small></span><input class="input" id="quote-project" maxlength="150" placeholder="Название проекта" autocomplete="off"></label>
<label class="field"><span class="field__label">Комментарий <small>необязательно</small></span><textarea class="textarea" id="quote-note" maxlength="500" rows="3" placeholder="Примечание для предложения"></textarea></label>
<button type="submit" class="btn btn--block" id="quote-download" disabled>Скачать КП в PDF</button>
</form>
<p class="t-small">В PDF войдут товары, количество, цены и итог. Доставка рассчитывается отдельно. Скачивание предложения не оформляет заказ; менеджер салона свяжется с вами по указанному телефону. Нажимая «Скачать», вы соглашаетесь на обработку контактных данных для подготовки предложения. ${esc(priceNote)}.</p>
</div>
</div>
</dialog>
<div class="toast" id="toast" role="status" aria-live="polite"></div>`;
}

/**
 * Полный HTML-документ страницы.
 * @param {object} page  описание страницы ({title, description, name, styles, scripts, bodyClass, is404, head})
 * @param {object} ctx   контекст сборки (url, asset, root, isCurrent…)
 * @param {string} body  содержимое <main>
 */
export function layout(page, ctx, body) {
  const title = page.title ? `${page.title} — Italon Experience` : 'Italon Experience — салон керамогранита Italon и X2 в Краснодаре';
  const styles = (page.styles || []).map(name => `<link rel="stylesheet" href="${ctx.asset(`pages/${name}.css`)}">`).join('');
  const scripts = (page.scripts || []).map(name => `<script type="module" src="${ctx.asset(`pages/${name}.js`)}"></script>`).join('');
  return `<!doctype html>
<html lang="ru" class="no-js" data-root="${ctx.root || './'}" data-page="${esc(page.name || 'page')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${page.is404 ? `<script>${BASE_404}</script>\n` : ''}<title>${esc(title)}</title>
<meta name="description" content="${esc(page.description || '')}">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="${ctx.root}favicon.svg" type="image/svg+xml">
<link rel="preload" href="${ctx.root}fonts/inter-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
<script>${BOOT}</script>
<link rel="stylesheet" href="${ctx.asset('site.css')}">${styles}
<script type="module" src="${ctx.asset('main.js')}"></script>${scripts}${page.head || ''}
</head>
<body class="${esc(['page-' + (page.name || 'page'), page.bodyClass].filter(Boolean).join(' '))}">
<a class="skip-link" href="#main">К содержанию</a>
<noscript><p class="noscript-note">JavaScript выключен: страницы и каталог доступны для чтения, а поиск, корзина, расчёт и PDF работают при включённом JavaScript.</p></noscript>
${header(ctx)}
<main id="main" tabindex="-1">
${body}
</main>
${footer(ctx)}
${menu(ctx)}
${search(ctx)}
${dialogs()}
</body>
</html>
`;
}
