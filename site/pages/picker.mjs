// /picker/ — подбор керамогранита: по описанию (обычным языком) и по загруженному фото. Всё считается в браузере посетителя,
// внешних сервисов и платных API нет; загруженное фото никуда не отправляется. Логика — site/js/pages/picker.mjs, правила — site/shared/picker-*.mjs.
import { pageHead } from '../shared/blocks.mjs';
import { stats } from '../data.mjs';
import { positions } from '../shared/format.mjs';

const EXAMPLES = [
  'светлый мрамор с серыми прожилками, глянец, 60×120',
  'тёмно-серый под бетон, матовый, до 4000 ₽',
  'тёплое дерево для террасы',
  'бежевый травертин, большой формат',
  'чёрный мрамор с золотыми прожилками',
  'белый однотонный матовый для минимализма',
];
const CAMERA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
const TEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h9"/></svg>';

export default {
  path: '/picker/',
  title: 'Подбор керамогранита по описанию и по фото',
  description: `Опишите нужную плитку словами или загрузите фото — подберём похожий керамогранит из каталога Italon: ${stats.total} позиций с ценами. Расчёт идёт в вашем браузере, фото не отправляется.`,
  styles: ['catalog', 'picker'],
  scripts: ['picker'],
  render: ctx => `${pageHead(ctx, {
    crumbs: [['Подбор']],
    eyebrow: 'Каталог · подбор',
    title: 'Подбор керамогранита',
    lead: `Опишите, какую плитку вы ищете, или загрузите фото — покажем похожие позиции из каталога (${positions(stats.total)}). Это подсказка для выбора: оттенки на экране и в жизни отличаются, образцы можно посмотреть в салоне.`,
  })}
<section class="picker" aria-label="Подбор керамогранита">
<div class="wrap picker__wrap">
<div class="picker__tabs" role="tablist" aria-label="Способ подбора">
<button type="button" class="picker__tab" role="tab" id="tab-text" aria-controls="panel-text" aria-selected="true">${TEXT}<span>По описанию</span></button>
<button type="button" class="picker__tab" role="tab" id="tab-image" aria-controls="panel-image" aria-selected="false" tabindex="-1">${CAMERA}<span>По фото</span></button>
</div>

<div class="picker__panel" id="panel-text" role="tabpanel" aria-labelledby="tab-text">
<form class="picker__form" id="pick-text-form" role="search" autocomplete="off">
<label class="field" for="pick-text"><span class="field__label">Что вы ищете?</span>
<textarea class="textarea picker__text" id="pick-text" name="q" rows="2" maxlength="300" placeholder="Например: светло-серый под бетон, матовый, 60×120, до 5000 ₽" aria-describedby="pick-text-hint"></textarea></label>
<p class="field__hint" id="pick-text-hint">Можно указать цвет, рисунок (мрамор, дерево, камень, бетон), поверхность (глянец, мат), формат, бюджет, где будет лежать (улица, терраса) или название коллекции.</p>
<div class="picker__actions"><button type="submit" class="btn">Подобрать</button><button type="button" class="btn btn--outline" id="pick-text-clear" hidden>Очистить</button></div>
</form>
<div class="picker__examples"><p class="eyebrow">Попробуйте</p><ul role="list">${EXAMPLES.map(e => `<li><button type="button" class="chip" data-example="${e.replace(/"/g, '&quot;')}">${e}</button></li>`).join('')}</ul></div>
<div class="picker__understood" id="pick-understood" hidden></div>
<p class="picker__note" id="pick-notes" hidden></p>
<p class="picker__status" id="pick-text-status" role="status" aria-live="polite"></p>
<div class="product-grid picker__grid" id="pick-text-grid"></div>
<div class="picker__more" id="pick-text-more" hidden><button type="button" class="btn btn--outline">Показать ещё</button></div>
</div>

<div class="picker__panel" id="panel-image" role="tabpanel" aria-labelledby="tab-image" hidden>
<div class="picker__drop" id="pick-drop">
<input class="sr-only" type="file" id="pick-file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" aria-describedby="pick-image-hint">
<label class="btn" for="pick-file">${CAMERA}<span>Выбрать фото</span></label>
<p class="picker__drop-text">…или перетащите фото сюда, или вставьте из буфера (Ctrl+V)</p>
<p class="field__hint" id="pick-image-hint">Фото плитки, пола или интерьера. Обрабатывается в вашем браузере и никуда не отправляется. До 20 МБ: JPG, PNG, WebP.</p>
</div>
<div class="picker__editor" id="pick-editor" hidden>
<div class="picker__stage"><canvas id="pick-canvas" aria-label="Загруженное фото с рамкой области поиска"></canvas>
<div class="picker__frame" id="pick-frame" tabindex="0" role="group" aria-label="Область поиска. Перетащите или двигайте стрелками"></div></div>
<div class="picker__controls">
<p class="eyebrow">Область для поиска</p>
<p class="t-small">Рамка должна лежать на самой плитке: так точнее цвет и рисунок.</p>
<label class="field"><span class="field__label">Размер рамки</span><input type="range" id="pick-size" min="15" max="100" value="60" aria-describedby="pick-size-out"></label>
<div class="picker__buttons"><button type="button" class="btn btn--outline" id="pick-whole">Вся картинка</button><button type="button" class="btn btn--outline" id="pick-other">Другое фото</button></div>
<label class="check"><input type="checkbox" id="pick-plates" checked><span>Только плитка (без мозаики и декора)</span></label>
<div class="picker__sample"><canvas id="pick-sample" width="96" height="96" aria-hidden="true"></canvas><p class="t-small" id="pick-sample-text"></p></div>
</div>
</div>
<p class="picker__note" id="pick-image-notes" hidden></p>
<p class="picker__status" id="pick-image-status" role="status" aria-live="polite"></p>
<h2 class="t-h3 picker__sub" id="pick-sim-title" hidden>Самые похожие</h2>
<div class="product-grid picker__grid" id="pick-sim-grid"></div>
<h2 class="t-h3 picker__sub" id="pick-pat-title" hidden>Похожий рисунок в других оттенках</h2>
<div class="product-grid picker__grid" id="pick-pat-grid"></div>
</div>
<p class="picker__fine t-small">Подбор — автоматический и приблизительный: он сравнивает цвет, рисунок и поверхность по фотографиям каталога. Окончательный выбор лучше сверить с образцом. Цены — по прайсу от 01.07.2026, склад Краснодар, с НДС.</p>
<noscript><p class="t-small">Подбор работает при включённом JavaScript. Все позиции доступны в <a class="link" href="${ctx.url('/catalog/')}">каталоге</a>.</p></noscript>
</div>
</section>`,
};
