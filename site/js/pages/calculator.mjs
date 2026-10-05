// Калькулятор упаковок: формулы src/pricing.mjs (calculateArea) на данных public/data/catalog.json.
// ?code=<артикул> выбирает материал (ссылка «Рассчитать количество» со страницы товара).
import { loadCatalog, addToCart } from '../shop.mjs';
import { $, $$ } from '../ui.mjs';
import { esc, money, number, titleRu } from '../../shared/format.mjs';

let pricing, mode = 'area', result = null;
const select = $('#calc-product'), out = $('#calc-result'), error = $('#calc-error'), add = $('#calc-add');

function update() {
  try {
    const area = mode === 'area' ? Number($('#calc-area').value) : Number($('#calc-length').value) * Number($('#calc-width').value);
    if (mode === 'size' && [$('#calc-length'), $('#calc-width')].some(i => !(Number(i.value) > 0 && Number(i.value) <= 1000))) throw new Error('Укажите положительные размеры до 1 000 м.');
    result = pricing.calculateArea(select.value, area, Number($('#calc-reserve').value));
    out.innerHTML = `<p class="t-h2">${number(result.packs)} ${esc(result.product.orderUnit)}</p>
<dl class="specs"><div><dt>Площадь в упаковках</dt><dd>${number(result.quantity)} м²</dd></div><div><dt>С учётом запаса</dt><dd>${number(result.target)} м²</dd></div>${result.pieces ? `<div><dt>Плит</dt><dd>${number(result.pieces)}</dd></div>` : ''}<div><dt>Сумма с НДС</dt><dd>${money(result.totalKopecks)}</dd></div></dl>
${result.minimumApplied ? `<p class="t-small">Учтён минимальный заказ: ${esc(result.product.minimum)}.</p>` : ''}`;
    error.hidden = true; add.disabled = false;
  } catch (e) { result = null; out.innerHTML = '<p class="t-h2">—</p>'; error.textContent = e.message; error.hidden = false; add.disabled = true; }
}

loadCatalog().then(catalog => {
  pricing = catalog.pricing;
  const items = catalog.products.filter(p => p.unit === 'м²' && p.canOrder);
  select.innerHTML = items.map(p => `<option value="${p.code}">${esc(titleRu(p.collection))} — ${esc(p.name)} · ${p.code}</option>`).join('');
  const wanted = new URLSearchParams(location.search).get('code');
  select.value = items.some(p => p.code === wanted) ? wanted : (items.find(p => p.collectionId === 'x2-magma' && p.format === '60X120') || items[0]).code;
  select.disabled = false;
  for (const el of $$('#calc-form input, #calc-form select')) el.addEventListener('input', update);
  for (const button of $$('[data-calc-mode]')) button.addEventListener('click', () => {
    mode = button.dataset.calcMode;
    for (const b of $$('[data-calc-mode]')) b.setAttribute('aria-pressed', String(b === button));
    $('#calc-area-row').hidden = mode !== 'area'; $('#calc-size-row').hidden = mode !== 'size';
    update();
  });
  add.addEventListener('click', () => { if (result) addToCart(result.code, result.packs); });
  update();
}).catch(() => { select.innerHTML = '<option>Каталог временно недоступен</option>'; });
