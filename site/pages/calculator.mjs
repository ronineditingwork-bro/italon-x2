// /calculator/ — расчёт упаковок: слева заголовок и пояснение «как считаем», справа панель расчёта.
// Логика — site/js/pages/calculator.mjs (поиск материала — combobox), формулы — src/pricing.mjs
// (целые упаковки, запас, минимальный заказ из прайса). ?code=<артикул> выбирает материал
// (ссылки «Рассчитать количество» со страниц товара); также ?mode=size&length=&width=&area=&reserve=.
import { breadcrumbs } from '../shared/blocks.mjs';
import { products } from '../data.mjs';
import { CLOSE, number } from '../shared/format.mjs';

const SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>';

export default {
  path: '/calculator/',
  title: 'Калькулятор упаковок',
  description: 'Расчёт количества упаковок керамогранита Italon и X2 по площади или размерам помещения: запас на подрезку, целые упаковки, минимальный заказ и сумма по прайсу с НДС.',
  styles: ['calculator'],
  scripts: ['calculator'],
  render: ctx => {
    const count = products.filter(p => p.unit === 'м²' && p.canOrder).length;
    const steps = [
      ['Площадь', 'Укажите площадь в м² или длину и ширину помещения — площадь посчитаем сами.'],
      ['Запас', 'Добавляем выбранный процент на подрезку и возможный бой.'],
      ['Целые упаковки', 'Округляем вверх до целых коробок: плитка продаётся упаковками, указанными в прайсе.'],
      ['Минимальный заказ', 'Минимальный заказ — одна коробка (для позиций, которые продаются поштучно, — как указано в карточке). Паллетами покупать не обязательно.'],
      ['Сумма', 'Считаем по цене прайса от 01.07.2026 (склад Краснодар, с НДС) за фактическое количество в упаковках.'],
    ];
    return `<div class="wrap">${breadcrumbs(ctx, [['Калькулятор']])}</div>
<section class="calc-page" aria-labelledby="calc-title">
<div class="wrap calc-layout">
<div class="calc-intro">
<p class="eyebrow" data-reveal>Калькулятор упаковок</p>
<h1 class="t-h1" id="calc-title" data-reveal data-reveal-delay="60">Сколько плитки нужно</h1>
<p class="t-lead calc-intro__lead" data-reveal data-reveal-delay="120">Выберите материал и укажите площадь: посчитаем целые упаковки с запасом на подрезку, учтём минимальный заказ из прайса и сумму с НДС. Готовый расчёт можно сразу положить в корзину и выгрузить коммерческое предложение в PDF.</p>
</div>
<div class="calc-how" data-reveal>
<h2 class="calc-how__title">Как считаем</h2>
<ol class="calc-how__list" role="list">${steps.map(([t, d], i) => `<li><span class="calc-how__n">${String(i + 1).padStart(2, '0')}</span><div><h3>${t}</h3><p>${d}</p></div></li>`).join('')}</ol>
<p class="calc-how__note">Расчёт ориентировочный: раскладка, схема подрезки и наличие согласуются отдельно — в салоне или по телефону.</p>
<figure class="calc-photo" id="calc-photo" hidden><div class="media calc-photo__media"></div><figcaption class="media-note"></figcaption></figure>
</div>
<div class="calc-panel" id="calc-panel">
<form class="calc-form" id="calc-form" novalidate aria-labelledby="calc-title">
<div class="calc-block">
<label class="calc-step" for="calc-material" id="calc-material-label"><span>01</span>Материал</label>
<div class="combo" id="calc-combo">
<div class="combo__control">${SEARCH}<input class="combo__input" id="calc-material" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="calc-listbox" aria-describedby="calc-material-hint" autocomplete="off" spellcheck="false" placeholder="Коллекция, цвет или артикул" disabled>
<button type="button" class="combo__clear" id="calc-clear" aria-label="Очистить поиск материала" hidden>${CLOSE}</button></div>
<ul class="combo__list" id="calc-listbox" role="listbox" aria-labelledby="calc-material-label" hidden></ul>
</div>
<p class="field__hint" id="calc-material-hint">${number(count, 0)} позиций с ценой за м². Стрелки ↑ ↓ — выбор, Enter — подтвердить.</p>
<p class="calc-notice" id="calc-notice" role="alert" hidden></p>
<div class="calc-picked" id="calc-picked" hidden></div>
</div>
<fieldset class="calc-block">
<legend class="calc-step"><span>02</span>Площадь</legend>
<div class="segmented" role="radiogroup" aria-label="Способ расчёта">
<label><input type="radio" name="mode" value="area" checked><span>По площади</span></label>
<label><input type="radio" name="mode" value="size"><span>По размерам</span></label>
</div>
<div class="calc-inputs" id="calc-area-row">
<label class="field"><span class="field__label">Площадь, м²</span><span class="calc-unit"><input class="input" id="calc-area" name="area" type="text" inputmode="decimal" value="20" autocomplete="off" aria-describedby="calc-area-error"><span aria-hidden="true">м²</span></span><span class="calc-error" id="calc-area-error"></span></label>
</div>
<div class="calc-inputs calc-inputs--two" id="calc-size-row" hidden>
<label class="field"><span class="field__label">Длина, м</span><span class="calc-unit"><input class="input" id="calc-length" name="length" type="text" inputmode="decimal" value="5" autocomplete="off" aria-describedby="calc-length-error"><span aria-hidden="true">м</span></span><span class="calc-error" id="calc-length-error"></span></label>
<span class="calc-times" aria-hidden="true">×</span>
<label class="field"><span class="field__label">Ширина, м</span><span class="calc-unit"><input class="input" id="calc-width" name="width" type="text" inputmode="decimal" value="4" autocomplete="off" aria-describedby="calc-width-error"><span aria-hidden="true">м</span></span><span class="calc-error" id="calc-width-error"></span></label>
<p class="field__hint calc-inputs__sum" id="calc-size-sum"></p>
</div>
</fieldset>
<fieldset class="calc-block">
<legend class="calc-step"><span>03</span>Запас на подрезку</legend>
<div class="segmented segmented--five" role="radiogroup" aria-label="Запас на подрезку">${[0, 5, 10, 15, 20].map(v => `<label><input type="radio" name="reserve" value="${v}"${v === 10 ? ' checked' : ''}><span>${v} %</span></label>`).join('')}</div>
<p class="field__hint">Запас покрывает подрезку и возможный бой. Нужный процент зависит от раскладки и формата — его стоит уточнить при согласовании.</p>
</fieldset>
</form>
<section class="calc-result" aria-labelledby="calc-result-title">
<h2 class="calc-step" id="calc-result-title"><span>04</span>Результат</h2>
<div class="calc-output" id="calc-output"><p class="calc-empty">Выберите материал — здесь появится расчёт: упаковки, площадь, количество штук и сумма.</p>
<noscript><p class="calc-empty">Калькулятор работает при включённом JavaScript. Цены и упаковки каждой позиции — на страницах товаров в <a class="link" href="${ctx.url('/catalog/')}">каталоге</a>.</p></noscript></div>
<p class="sr-only" id="calc-live" role="status" aria-live="polite"></p>
<div class="calc-actions"><button type="button" class="btn" id="calc-add" disabled>Добавить в корзину</button><a class="btn btn--outline" id="calc-product-link" href="${ctx.url('/catalog/')}" hidden>Страница товара</a></div>
<p class="calc-note">Расчёт ориентировочный; раскладка и подрезка согласуются отдельно. Цены по прайсу от 01.07.2026, склад Краснодар, с НДС; наличие уточняется. Сайт не принимает оплату.</p>
</section>
</div>
</div>
</section>`;
  },
};
