// /calculator/ — расчёт упаковок по площади. Каркас этапа A (логика — site/js/pages/calculator.mjs,
// формулы — src/pricing.mjs: целые упаковки, запас, минимальный заказ из прайса).
import { pageHead } from '../shared/blocks.mjs';

export default {
  path: '/calculator/',
  title: 'Калькулятор упаковок',
  description: 'Расчёт количества упаковок керамогранита Italon и X2 по площади с запасом и минимальным заказом.',
  styles: ['calculator'],
  scripts: ['calculator'],
  render: ctx => `${pageHead(ctx, { crumbs: [['Калькулятор']], title: 'Калькулятор упаковок', lead: 'Укажите площадь и запас на подрезку: рассчитаем целые упаковки, сумму с НДС и учтём минимальный заказ из прайса.' })}
<section class="section" style="padding-top:0">
<div class="wrap grid calc">
<form class="calc__form" id="calc-form" novalidate>
<label class="field"><span class="field__label">Материал</span><select class="select" id="calc-product" disabled><option>Загружаем каталог…</option></select><span class="field__hint">Позиции с ценой за м². Начните вводить название в поиске каталога, если не знаете артикул.</span></label>
<div class="chips" role="group" aria-label="Способ расчёта"><button type="button" class="chip" data-calc-mode="area" aria-pressed="true">По площади</button><button type="button" class="chip" data-calc-mode="size" aria-pressed="false">По размерам</button></div>
<div class="field-row" id="calc-area-row"><label class="field"><span class="field__label">Площадь, м²</span><input class="input" id="calc-area" type="number" inputmode="decimal" min="0.01" max="100000" step="0.01" value="20"></label></div>
<div class="field-row" id="calc-size-row" hidden><label class="field"><span class="field__label">Длина, м</span><input class="input" id="calc-length" type="number" inputmode="decimal" min="0.01" max="1000" step="0.01" value="5"></label><label class="field"><span class="field__label">Ширина, м</span><input class="input" id="calc-width" type="number" inputmode="decimal" min="0.01" max="1000" step="0.01" value="4"></label></div>
<label class="field"><span class="field__label">Запас на подрезку</span><select class="select" id="calc-reserve"><option value="0">Без запаса</option><option value="5">5%</option><option value="10" selected>10%</option><option value="15">15%</option><option value="20">20%</option></select></label>
<p class="form-error" id="calc-error" role="alert" hidden></p>
</form>
<div class="calc__result" aria-live="polite">
<p class="eyebrow">Результат</p>
<div id="calc-result"><p class="t-h2">—</p></div>
<button type="button" class="btn btn--block" id="calc-add" disabled>Добавить расчёт в корзину</button>
<p class="t-small">Расчёт по площади. Раскладка и схема подрезки согласуются отдельно.</p>
</div>
<noscript><p class="t-small">Калькулятор работает при включённом JavaScript.</p></noscript>
</div>
</section>`,
};
