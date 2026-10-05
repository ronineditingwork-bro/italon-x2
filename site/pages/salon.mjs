// /salon/ — салон: адрес, часы, телефон, карта Яндекс (с запасной карточкой), маршруты.
import { esc } from '../shared/format.mjs';
import { pageHead } from '../shared/blocks.mjs';
import { salon } from '../data.mjs';

export default {
  path: '/salon/',
  title: 'Салон',
  description: `Салон Italon Experience: ${salon.address}. Пн—Пт 10:00—19:00, Сб—Вс 10:00—18:00.`,
  styles: ['salon'],
  render: ctx => `${pageHead(ctx, { crumbs: [['Салон']], eyebrow: 'Italon Experience', title: 'Салон в Краснодаре', lead: 'Монобрендовый салон Italon: коллекции показаны готовыми интерьерными решениями. Приходите посмотреть материалы вживую.' })}
<section class="section" style="padding-top:0"><div class="wrap grid salon">
<div class="salon__info">
<dl class="specs">
<div><dt>Адрес</dt><dd><address>${esc(salon.address)}</address></dd></div>
${salon.hours.map(([d, t]) => `<div><dt>${esc(d)}</dt><dd>${esc(t)}</dd></div>`).join('')}
<div><dt>Парковка</dt><dd>Есть</dd></div>
<div><dt>Телефон</dt><dd><a class="link" href="${salon.phoneHref}">${esc(salon.phone)}</a></dd></div>
<div><dt>Почта</dt><dd><a class="link" href="mailto:${salon.email}">${esc(salon.email)}</a></dd></div>
</dl>
<div class="btn-row"><a class="btn" href="${salon.maps.yandex}" target="_blank" rel="noopener noreferrer">Построить маршрут</a><a class="btn btn--outline" href="${salon.phoneHref}">Записаться по телефону</a></div>
<p class="t-small">Маршрут: <a class="link" href="${salon.maps.yandex}" target="_blank" rel="noopener noreferrer">Яндекс Карты</a> · <a class="link" href="${salon.maps.twoGis}" target="_blank" rel="noopener noreferrer">2ГИС</a> · <a class="link" href="${salon.maps.google}" target="_blank" rel="noopener noreferrer">Google Maps</a></p>
</div>
<div class="salon__map">
<div class="salon__fallback"><p class="t-h4">${esc(salon.address)}</p><p class="t-small">Если карта не загрузилась, откройте маршрут в Яндекс Картах, 2ГИС или Google Maps.</p></div>
<iframe src="${salon.maps.widget}" title="Карта: салон Italon Experience, ${esc(salon.address)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
</div>
</div></section>`,
};
