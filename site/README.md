# site/ — исходники сайта Italon Experience

Светлый архитектурный минимализм по брифу (`/home/user/work/BRIEF-kohler.json`, ТЗ `/home/user/work/REDESIGN.md` v2).
Многостраничный статический сайт + существующий API корзины `/api/cart`.

```
npm run build:site   # site/ → public/ (страницы, assets, data/catalog.json)
npm run dev          # сборка сайта + сервера и запуск (порт 4174)
npm run check && npm test && npm run test:hosting
node tests/ui-check.mjs   # интерфейс корзины/КП в happy-dom (после build:site)
```

## Структура

| Путь | Что внутри |
| --- | --- |
| `layout.mjs` | `<head>`, шапка, мобильное меню, поиск, подвал, диалоги (товар, фото, корзина), уведомление |
| `data.mjs` | данные для сборки: коллекции (форматы, отделки, кромка), `stats`, `salon`, `nav`, `categories`, `categoryOf`, `variantKey`/`variantsOf` |
| `pages/*.mjs` | страницы; генераторы (`collections.mjs`, `product.mjs`) экспортируют массив |
| `shared/format.mjs` | общие для Node и браузера: `esc`, `money`, `number`, `fmt`, `plural`, `positions`, `titleRu`, `normalize`, `productCard`, `productImage`, `priceHtml`, `productUrl`, `collectionUrl`, иконки `ARROW`, `CLOSE`, `CART_ICON`, `PLUS_ICON` |
| `shared/blocks.mjs` | блоки страниц при сборке: `pageHead`, `breadcrumbs`, `image`, `collectionCard` |
| `css/tokens.css` | все цвета, шрифт, шкала, сетка, время — только через `var(--…)` |
| `css/base.css` | сброс, типографика, сетка, шапка, меню, поиск, подвал, движение |
| `css/components.css` | кнопки, ссылки, медиа, карточки, формы, чипы, характеристики, крошки, пагинация, диалоги, корзина, уведомление, шапка страницы |
| `css/pages/<имя>.css` | стили одной страницы → `assets/pages/<имя>.css` |
| `js/main.mjs` | вход на каждой странице: диалоги, меню, поиск, появление блоков, магазин |
| `js/shop.mjs` | каталог (лениво), корзина (API → запасной localStorage), диалоги товара/фото/корзины, PDF КП, `window.Italon` |
| `js/ui.mjs` | `$`, `$$`, `openDialog`, `closeDialog`, `toast`, `ROOT`, `rootRel`, `siteUrl`, `reducedMotion` |
| `js/pages/<имя>.mjs` | скрипт одной страницы → `assets/pages/<имя>.js` |

Сборка (`scripts/build-site.mjs`) пишет в `public/` и перечисляет сгенерированное в `public/.site-manifest.json`
(удаляется перед следующей сборкой). Сгенерированное в git не хранится — см. `.gitignore`;
**новый раздел верхнего уровня (например, `/journal/`) добавьте в `.gitignore`** рядом с остальными.

## Как добавить страницу

1. `site/pages/journal.mjs`:
   ```js
   import { pageHead } from '../shared/blocks.mjs';
   import { stats } from '../data.mjs';
   export default {
     path: '/journal/',            // папка → public/journal/index.html; '/x.html' → файл
     title: 'Журнал',              // в <title> добавится « — Italon Experience»
     description: 'Короткое описание.',
     styles: ['journal'],          // необязательно: site/css/pages/journal.css
     scripts: ['journal'],         // необязательно: site/js/pages/journal.mjs
     render: ctx => `${pageHead(ctx, { crumbs: [['Журнал']], title: 'Журнал', lead: '…' })}
       <section class="section"><div class="wrap">…</div></section>`,
   };
   ```
   Генератор: `export default items.map(item => ({ path: `/x/${item.id}/`, name: 'x', … }))`
   (`name` задаёт класс `page-<name>` на `<body>`; по умолчанию — имя файла).
2. Ссылки и медиа — только через контекст (относительные пути, сайт работает в корне и под `/italon-x2/`):
   `ctx.url('/catalog/')`, `ctx.media('/media/terrace.webp')` (пути из данных), `ctx.asset('pages/x.css')`, `ctx.root`.
   Никогда не писать `href="/…"` — тест `tests/site.test.mjs` это ловит.
3. В браузере корень — `rootRel`/`ROOT` из `js/ui.mjs` (или `window.Italon.root`).
4. Пункт меню — в `nav` (`site/data.mjs`), он попадёт в шапку, мобильное меню и подсветку текущего раздела.
5. `npm run build:site`, затем `bash /home/user/work/tools/restart-main.sh` и снимки.

## Атрибуты (работают на любой странице, в т.ч. в HTML, добавленном скриптом)

| Атрибут | Действие |
| --- | --- |
| `data-reveal` | мягкое появление: fade + подъём 20 px, 300 мс, один раз (IntersectionObserver) |
| `data-reveal-delay="120"` | задержка появления, мс |
| `data-reveal-group` | у детей с `data-reveal` шаг задержки 70 мс |
| `data-add="<код>"` | в корзину минимальное количество; если позиция уже в корзине — открыть корзину. С классом `.btn` текст меняется на «В корзине — открыть» |
| `data-add-packs="<n>"` | вместе с `data-add`: добавить n упаковок |
| `data-product="<код>"` | быстрый просмотр товара в диалоге |
| `data-scene="<id коллекции>"` | фото коллекции в диалоге со ссылкой на коллекцию |
| `data-laying="grass\|gravel\|pedestals\|adhesive"` | фото способа укладки X2 |
| `data-photo="<src>"` (+`data-photo-alt`, `data-photo-caption`, `data-photo-width/height`) | любое фото в лайтбоксе |
| `data-cart-open` | открыть корзину (на ссылке — `preventDefault`) |
| `data-search-open` | открыть поиск (ссылка ведёт на каталог, без JS — переход) |
| `data-menu-open` | мобильное меню |
| `data-dialog-close` | закрыть ближайший `<dialog>` |
| `data-cart-count` | счётчик позиций корзины (класс `.is-filled`, если не пусто) |
| `data-product-image` | на `<img>`: при ошибке загрузки — заглушка «Фото временно недоступно» |

Классы на `<html>`: `no-js`→`js` (встроенный скрипт), `reveal` (можно прятать `[data-reveal]`; снимается через 3 с, если `main.js` не загрузился),
`reduced` (prefers-reduced-motion), `page-fade` (fade при загрузке без View Transitions), `motion-ready` (main.js отработал), `has-dialog`.
Скрывать контент до анимации можно **только** под `.reveal` — без JS всё видно.

События `document`: `italon:ready` (магазин готов), `italon:cart` (`detail: {cart, mode}` после каждого изменения),
`italon:cart-refresh` (страница перерисовала карточки — обновить состояния кнопок `data-add`).

## window.Italon

```js
Italon.cart.add(code, packs?)      // Promise; packs по умолчанию — минимальный заказ
Italon.cart.open() / .remove(code) / .setPacks(code, n) / .get() / .ready() / .mode  // 'server' | 'local'
Italon.openProduct(code); Italon.openScene(collectionId); Italon.openLaying(id); Italon.openPhoto({src, alt, caption, width, height, link})
Italon.loadCatalog()  // Promise<{products, productMap, collections, collectionMap, laying, categories, pricing, priceInfo}>
Italon.pricing()      // Promise<{lineFor, calculateCart, calculateArea}> (src/pricing.mjs)
Italon.toast(text); Italon.reveal(scopeElement); Italon.root; Italon.format.{esc, money, number, fmt, titleRu, normalize}
```
Корзина: `GET/PUT api/cart` относительно корня сайта. Если API нет (404, не JSON, сеть, `file:`), корзина тихо
переходит в localStorage (`italon-cart-v1`) с пометкой «Сохранено в браузере на этом устройстве». Ошибка хранилища
сервера (5xx) показывается с кнопкой «Повторить». PDF КП (`src/quote.mjs` + `fonts/Inter-Quote.ttf`) собирается в браузере в обоих режимах.

`public/data/catalog.json`: `products[]` (поля `src/catalog.mjs` + `category`, `variantKey`; `image.src` без ведущего `/`),
`collections[]` (из `site/data.mjs`, без списка позиций), `laying{}`, `categories[]`, `priceInfo`. Главная его не грузит.
Фильтры каталога читаются из адреса: `catalog/?q=&section=italon|x2&category=plate|mosaic|decor|packaging&collection=<id>&format=<формат>&finish=<отделка>&page=`.

## Компоненты (разметка)

- Кнопки: `.btn` (чёрная), `.btn--outline`, `.btn--light`, `.btn--outline-light` (на фото), `.btn--small`, `.btn--block`; ряд — `.btn-row`.
- Ссылки: `.link-arrow` (+ `ARROW` из `shared/format.mjs`), `.link` (в тексте).
- Типографика: `.t-hero`, `.t-h1`, `.t-h2`, `.t-h3`, `.t-h4`, `.t-lead`, `.t-body`, `.t-small`, `.eyebrow`, `.t-muted`.
- Сетка: `.wrap` (поля + 1440), `.grid` (12 колонок), `.section`, `.section--alt` (фон #F5F3EF), `.section-head` + `.section-head__text`.
- Фото: `<figure class="media" style="--ratio:4/5">` (зум ≤1.025 у ссылки-родителя или `.media--hover`), `.media--contain`, `.media-note`, `.media-missing`.
- Карточки: `.tile` + `.tiles` (`--cols`), `.collection-card` + `.collection-grid` (или `collectionCard()`), `productCard()` + `.product-grid` (`--cols`).
- Формы: `.field` > `.field__label` + `.input|.select|.textarea` (+ `.field__hint`), `.field-row`, `.form-error`, `.demo-note` (пометка демонстрационной формы), `.check`.
- Фильтры: `.chips` > `.chip[aria-pressed]`.
- Данные: `.specs` (dl), `.table`, `.breadcrumbs` (или `breadcrumbs()`), `.pagination`, `.empty-state`, `.page-head` (`pageHead()`), `.prose`.
- Диалоги: `.dialog`, `.dialog--side`, `.dialog--photo`, `.dialog__scroll`, `.dialog__close`, `.dialog__head`, `.dialog__title` — открывать через `openDialog()`.

## Ограничения и что осталось этапу B

- Страницы, кроме главной, — аккуратные каркасы: каталогу нужны мобильная панель фильтров, фильтр цены, сортировка;
  странице товара — живое переключение вариантов отделки без перезагрузки (сейчас варианты — ссылки на соседние позиции),
  галерея; «Вдохновение» — журнальная вёрстка; X2 — интерактив способов укладки; калькулятор — поиск материала.
- Варианты отделки — эвристика по названиям прайса (`variantKey`); 96 позиций имеют ≥2 отделки.
- `hosting/server.mjs` дополнен раздачей `папка/ → index.html`, редиректом `/раздел → /раздел/`, `404.html` и типом `.json` — иначе многостраничный сайт не открывался.
- 404.html вычисляет корень через встроенный `<base>` (корень домена или `/<имя>-x2/`).
- `catalog.json` ≈ 700 КБ без сжатия (≈ 70 КБ gzip через Caddy); грузится только там, где нужен (поиск, быстрый просмотр, каталог, калькулятор, корзина без API).
