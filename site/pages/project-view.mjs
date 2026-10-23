// /p/ — страница просмотра проекта по защищённой ссылке (адрес вида /p/#<токен>). Токен — во фрагменте адреса: он не уходит на сервер при загрузке страницы,
// не попадает в логи и заголовок Referer. Показывает только картинку результата, город и выбранные материалы; телефона, улицы и дома здесь нет и быть не может.
import { esc } from '../shared/format.mjs';

export default {
  path: '/p/',
  name: 'project-view',
  noindex: true,
  bodyClass: 'pv-body',
  title: 'Проект X2 Outdoor Lab',
  description: 'Проект плитки Italon X2 — просмотр по ссылке.',
  styles: ['project-view'],
  scripts: ['project-view'],
  head: '<meta name="referrer" content="no-referrer">',
  render: ctx => `<section class="pv" data-pv data-state="loading">
<div class="wrap pv__wrap">
<p class="eyebrow">X2 OUTDOOR LAB</p>
<h1 class="pv__title" data-pv-title>Проект</h1>
<p class="pv__sub" data-pv-sub aria-live="polite">Загружаем проект…</p>
<figure class="pv__fig" data-pv-fig hidden><img alt="Визуализация проекта: плитка Italon X2" data-pv-img><figcaption>Визуализация приблизительна: цвет зависит от экрана и освещения.</figcaption></figure>
<ul class="pv__items" data-pv-items></ul>
<div class="pv__cta" data-pv-cta hidden>
<a class="btn" href="${esc(ctx.url('/calculator/'))}">Получить расчёт у Italon X2</a>
<a class="btn btn--outline" href="${esc(ctx.url('/outdoor/'))}" data-pv-open>Примерить свой вариант</a>
<a class="btn btn--outline" href="tel:+79182489248">Позвонить: +7 918 24 89 248</a>
</div>
<p class="pv__fine t-small">Эта страница доступна только по ссылке. Телефон и точный адрес автора проекта здесь не показываются. Автор может отозвать ссылку в любой момент.</p>
</div>
</section>`,
};
