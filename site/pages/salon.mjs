// /salon/ — салон: адрес, часы, парковка, телефон, почта; карта Яндекс по нажатию (запасная карточка —
// чтобы пустой или заблокированный iframe не выглядел сломанным); маршруты в Яндекс Картах, 2ГИС, Google Maps;
// запись — телефон, почта или демонстрационная форма (ничего не отправляет на сервер, только готовит письмо).
// Фото салона нет: типографика, линии, блоки #F5F3EF и один кадр коллекции с честной подписью.
import { esc, fmt, ARROW } from '../shared/format.mjs';
import { pageHead } from '../shared/blocks.mjs';
import { salon, stats, collections } from '../data.mjs';

const ext = 'target="_blank" rel="noopener noreferrer"';
const PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6.1-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.9 12 21 12 21Z"/><circle cx="12" cy="9.8" r="2.3"/></svg>';
const days = [['Пн — Пт', '1,2,3,4,5'], ['Сб — Вс', '6,0']];

function visit(ctx) {
  return `<section class="section salon-main" style="padding-top:0" aria-labelledby="visit-title">
<div class="wrap grid salon-main__grid">
<div class="salon-card" data-reveal>
<h2 class="sr-only" id="visit-title">Адрес и часы работы</h2>
<p class="eyebrow">Адрес</p>
<address class="salon-card__address"><span class="salon-card__street">${esc(salon.street)}</span><span class="salon-card__city">${esc(salon.city)}</span></address>
<dl class="specs salon-card__hours" data-hours>
${salon.hours.map(([d, t], i) => `<div data-days="${days[i]?.[1] || ''}"><dt>${esc(d)}</dt><dd>${esc(t)}</dd></div>`).join('')}
<div><dt>Парковка</dt><dd>Есть</dd></div>
</dl>
<p class="salon-card__today t-small" data-today hidden></p>
<div class="salon-card__contacts">
<a class="salon-contact" href="${salon.phoneHref}"><span class="eyebrow">Телефон</span><span class="salon-contact__value">${esc(salon.phone)}</span></a>
<a class="salon-contact" href="mailto:${salon.email}"><span class="eyebrow">Почта</span><span class="salon-contact__value">${esc(salon.email)}</span></a>
</div>
<div class="salon-card__routes">
<a class="btn" href="${salon.maps.yandex}" ${ext}>Построить маршрут<span class="sr-only"> в Яндекс Картах (откроется в новой вкладке)</span></a>
<a class="btn btn--outline" href="${salon.maps.twoGis}" ${ext}>2ГИС<span class="sr-only"> (откроется в новой вкладке)</span></a>
<a class="btn btn--outline" href="${salon.maps.google}" ${ext}>Google Maps<span class="sr-only"> (откроется в новой вкладке)</span></a>
</div>
</div>
<div class="salon-map" data-map data-src="${esc(salon.maps.widget)}" data-reveal>
<div class="salon-map__fallback">
<span class="salon-map__pin">${PIN}</span>
<p class="salon-map__label"><span class="eyebrow">Italon Experience</span><span class="t-h3">${esc(salon.street)}</span><span class="t-small">${esc(salon.city)}</span></p>
<div class="salon-map__actions">
<button type="button" class="btn btn--light" data-map-load hidden>Показать карту Яндекса</button>
<a class="link-arrow" href="${salon.maps.yandex}" ${ext}>Открыть в Яндекс Картах ${ARROW}</a>
</div>
<p class="salon-map__note">Карта загружается с сервиса Яндекс Карты только по нажатию. Если она не открылась — воспользуйтесь кнопками маршрута.</p>
</div>
<noscript><iframe src="${esc(salon.maps.widget)}" title="Карта: салон Italon Experience, ${esc(salon.address)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></noscript>
</div>
</div>
</section>`;
}

function booking(ctx) {
  const subject = encodeURIComponent('Запись в салон Italon Experience');
  return `<section class="section section--alt salon-book" id="book" aria-labelledby="book-title">
<div class="wrap grid salon-book__grid">
<div class="salon-book__text">
<p class="eyebrow" data-reveal>Визит</p>
<h2 class="t-h2" id="book-title" data-reveal>Записаться в&nbsp;салон</h2>
<p class="t-body" data-reveal>Позвоните или напишите, когда удобно прийти и какие коллекции и форматы хотите посмотреть.</p>
<ul class="salon-ways" role="list" data-reveal>
<li><a class="salon-way" href="${salon.phoneHref}"><span class="salon-way__n t-num">01</span><span><strong>Позвонить</strong><span>${esc(salon.phone)}</span></span>${ARROW}</a></li>
<li><a class="salon-way" href="mailto:${salon.email}?subject=${subject}"><span class="salon-way__n t-num">02</span><span><strong>Написать</strong><span>${esc(salon.email)}</span></span>${ARROW}</a></li>
</ul>
</div>
<form class="salon-form" id="salon-form" action="mailto:${salon.email}?subject=${subject}" method="post" enctype="text/plain" novalidate data-reveal>
<p class="salon-form__title t-h4"><span class="salon-way__n t-num">03</span> Письмо в салон</p>
<div class="field-row">
<label class="field"><span class="field__label">Имя</span><input class="input" name="name" id="sf-name" autocomplete="name" maxlength="80" required></label>
<label class="field"><span class="field__label">Телефон</span><input class="input" name="phone" id="sf-phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="30" required></label>
</div>
<label class="field"><span class="field__label">Когда удобно прийти <small>необязательно</small></span><input class="input" name="date" id="sf-date" type="date"></label>
<label class="field"><span class="field__label">Что хотите посмотреть <small>необязательно</small></span><textarea class="textarea" name="comment" id="sf-comment" maxlength="600" rows="3" placeholder="Например: Шарм делюкс, формат 80 × 160"></textarea></label>
<p class="form-error" id="sf-error" role="alert" hidden></p>
<button type="submit" class="btn">Подготовить письмо</button>
<p class="demo-note">Демонстрационная форма: сайт не отправляет и не хранит данные. По кнопке откроется ваша почтовая программа с готовым письмом на ${esc(salon.email)} — отправляете его вы.</p>
</form>
</div>
</section>`;
}

function before(ctx) {
  const c = collections.find(x => x.id === 'charme-deluxe') || collections.find(x => x.image);
  const links = [
    ['/collections/', 'Коллекции', `${stats.collections} коллекции Italon и X2 с интерьерными кадрами.`],
    ['/catalog/', 'Каталог', `${stats.total} позиций прайса: форматы до ${fmt(stats.largestFormat)} см, отделки, цены.`],
    ['/calculator/', 'Калькулятор', 'Количество упаковок по площади — чтобы прийти с готовыми цифрами.'],
  ];
  return `<section class="section salon-before" aria-labelledby="before-title">
<div class="wrap grid salon-before__grid">
<div class="salon-before__text">
<p class="eyebrow" data-reveal>Перед визитом</p>
<h2 class="t-h2" id="before-title" data-reveal>Соберите подборку заранее</h2>
<p class="t-body" data-reveal>Отметьте позиции в каталоге — корзина соберёт коммерческое предложение в PDF, его удобно показать в салоне.</p>
<ul class="salon-links" role="list" data-reveal-group>
${links.map(([href, t, d]) => `<li data-reveal><a class="salon-link" href="${ctx.url(href)}"><span class="salon-link__title">${esc(t)} ${ARROW}</span><span class="salon-link__text">${esc(d)}</span></a></li>`).join('\n')}
</ul>
</div>
<figure class="salon-before__figure" data-reveal>
<a class="media salon-before__media" href="${ctx.url(`/collections/${c.id}/`)}"><img src="${ctx.media(c.image.src)}" alt="Коллекция ${esc(c.label)} в интерьере" width="${c.image.width}" height="${c.image.height}" loading="lazy" decoding="async"></a>
<figcaption class="media-note">На фото — коллекция ${esc(c.label)}, не интерьер салона</figcaption>
</figure>
</div>
</section>`;
}

export default {
  path: '/salon/',
  title: 'Салон',
  description: `Салон Italon Experience: ${salon.address}. Пн—Пт 10:00—19:00, Сб—Вс 10:00—18:00. Парковка есть.`,
  styles: ['salon'],
  scripts: ['salon'],
  render: ctx => `${pageHead(ctx, { crumbs: [['Салон']], eyebrow: 'Салон Italon Experience', title: 'Салон в Краснодаре',
    lead: 'Увидеть, прикоснуться, выбрать. Монобрендовый салон Italon: коллекции показаны готовыми интерьерными решениями. Приходите сравнить поверхности и отделки вживую.' })}
${visit(ctx)}
${booking(ctx)}
${before(ctx)}`,
};
