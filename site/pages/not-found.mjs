// 404.html — отдаётся по любому неизвестному адресу; корень сайта вычисляется встроенным <base>.
export default {
  path: '/404.html',
  is404: true,
  title: 'Страница не найдена',
  description: 'Страница не найдена.',
  render: ctx => `<section class="section"><div class="wrap prose">
<p class="eyebrow">Ошибка 404</p>
<h1 class="t-h1">Такой страницы нет</h1>
<p>Возможно, адрес изменился. Откройте каталог или коллекции — там все позиции прайса.</p>
<div class="btn-row"><a class="btn" href="${ctx.url('/catalog/')}">Открыть каталог</a><a class="btn btn--outline" href="${ctx.url('/')}">На главную</a></div>
</div></section>`,
};
