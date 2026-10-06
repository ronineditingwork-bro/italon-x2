// 404.html — отдаётся по любому неизвестному адресу; корень сайта вычисляется встроенным <base>.
// Поиск по каталогу (обычная форма GET → catalog/?q=), разделы сайта и кадр коллекции с честной подписью.
import { esc, ARROW } from '../shared/format.mjs';
import { nav, stats, collections } from '../data.mjs';

const notes = {
  '/collections/': `${stats.collections} коллекции Italon и X2`,
  '/x2/': 'Керамогранит 20 мм и способы укладки',
  '/catalog/': `${stats.total} позиции прайса с фильтрами`,
  '/calculator/': 'Количество упаковок по площади',
  '/inspiration/': 'Интерьерные кадры коллекций',
  '/salon/': 'Адрес, часы работы, маршрут',
};

export default {
  path: '/404.html',
  is404: true,
  title: 'Страница не найдена',
  description: 'Страница не найдена.',
  styles: ['not-found'],
  render: ctx => {
    const c = collections.find(x => x.id === 'velvet' && x.image) || collections.find(x => x.image);
    return `<section class="section nf"><div class="wrap grid nf__grid">
<div class="nf__main">
<p class="eyebrow" data-reveal>Ошибка 404</p>
<h1 class="t-hero nf__title" data-reveal>Такой страницы нет</h1>
<p class="t-lead nf__lead" data-reveal>Возможно, адрес изменился или в нём опечатка. Найдите позицию по названию или артикулу — или откройте нужный раздел.</p>
<form class="nf__search" action="${ctx.url('/catalog/')}" method="get" role="search" data-reveal>
<label class="field__label" for="nf-q">Поиск по каталогу</label>
<div class="nf__search-row"><input class="input" id="nf-q" name="q" type="search" placeholder="Название, цвет или артикул" autocomplete="off" enterkeyhint="search"><button type="submit" class="btn">Найти</button></div>
</form>
</div>
<figure class="nf__figure" data-reveal>
<a class="media nf__media" href="${ctx.url(`/collections/${c.id}/`)}"><img src="${ctx.media(c.image.src)}" alt="Коллекция ${esc(c.label)} в интерьере" width="${c.image.width}" height="${c.image.height}" decoding="async"></a>
<figcaption class="media-note">Коллекция ${esc(c.label)}</figcaption>
</figure>
<nav class="nf__nav" aria-label="Разделы сайта">
<ul class="nf__links" role="list" data-reveal-group>
<li data-reveal><a class="nf__link" href="${ctx.url('/')}"><span class="nf__link-title">Главная ${ARROW}</span><span class="nf__link-text">Italon Experience</span></a></li>
${nav.map(n => `<li data-reveal><a class="nf__link" href="${ctx.url(n.path)}"><span class="nf__link-title">${esc(n.label)} ${ARROW}</span><span class="nf__link-text">${esc(notes[n.path] || '')}</span></a></li>`).join('\n')}
</ul>
</nav>
</div></section>`;
  },
};
