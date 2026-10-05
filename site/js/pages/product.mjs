// Страница товара: галерея (плитка / коллекция в интерьере), живое переключение вариантов отделки
// без перезагрузки (фото, название, артикул, цена, минимальный заказ, характеристики, «В корзину»,
// расчёт, письмо, адрес через history.replaceState) и липкая панель цены на телефоне.
// Данные вариантов собраны при сборке (site/pages/product.mjs → <script id="pdp-variants">).
import { $, $$, reducedMotion } from '../ui.mjs';

const page = $('[data-pdp]');

// ---------- галерея ----------
function show(view) {
  for (const el of $$('.pdp__view', page)) el.classList.toggle('is-active', el.dataset.view === view);
  for (const b of $$('[data-show]', page)) b.setAttribute('aria-pressed', String(b.dataset.show === view));
}
page?.addEventListener('click', event => {
  const thumb = event.target.closest('[data-show]');
  if (thumb) show(thumb.dataset.show);
});

// ---------- варианты отделки ----------
let variants = [];
try { variants = JSON.parse($('#pdp-variants')?.textContent || '[]'); } catch { variants = []; }
const byCode = new Map(variants.map(v => [v.code, v]));
let current = $('[data-variant][aria-current]')?.dataset.variant;

const setText = (key, value) => { for (const el of $$(`[data-v="${key}"]`)) el.textContent = value; };
const setHtml = (key, value) => { for (const el of $$(`[data-v="${key}"]`)) el.innerHTML = value; };

function swapImage(v) {
  const img = $('[data-v-img]');
  const link = img?.closest('.pdp__view');
  if (!img || !v.image) return;
  const apply = () => {
    img.src = v.image.src; img.alt = v.image.alt;
    img.width = v.image.width; img.height = v.image.height;
    img.style.setProperty('--w', `${v.image.width}px`); img.style.setProperty('--h', `${v.image.height}px`);
    if (link) {
      link.href = v.image.src;
      link.dataset.photo = v.image.path; link.dataset.photoAlt = v.image.alt;
      link.dataset.photoCaption = `${v.name}, арт. ${v.code}`;
      link.dataset.photoWidth = v.image.width; link.dataset.photoHeight = v.image.height;
      link.setAttribute('aria-label', `Увеличить фото: ${v.name}`);
    }
    const thumb = $('[data-v-thumb]');
    if (thumb) { thumb.src = v.image.src; thumb.width = v.image.width; thumb.height = v.image.height; }
  };
  if (reducedMotion()) { apply(); return; }
  img.classList.add('is-swapping');
  const done = () => requestAnimationFrame(() => img.classList.remove('is-swapping'));
  setTimeout(() => { apply(); if (img.complete) done(); else { img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); } }, 160);
}

function select(code, { focus = false } = {}) {
  const v = byCode.get(code);
  if (!v || code === current) return;
  current = code;
  setText('name', v.name); setText('code', v.code); setText('surface', v.surface); setText('minimum', v.minimum);
  setHtml('price', v.price); setHtml('tile', v.tile); setHtml('pack', v.pack);
  for (const el of $$('[data-variant]')) {
    if (el.dataset.variant === code) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current');
  }
  for (const b of $$('[data-v-add]')) { b.dataset.add = code; b.disabled = !v.canOrder; }
  for (const a of $$('[data-v-calc]')) { if (v.calc) a.href = v.calc; a.hidden = !v.calc; }
  for (const a of $$('[data-v-mail]')) a.href = v.mail;
  const crumb = $('.breadcrumbs [aria-current="page"]');
  if (crumb) crumb.textContent = v.name;
  document.title = `${v.name} — арт. ${v.code} — Italon Experience`;
  swapImage(v);
  show('tile');
  try { history.replaceState(history.state, '', v.url + location.hash); } catch {}
  // кнопки «В корзину» сменили артикул — магазин пересчитает их состояние («В корзине — открыть»)
  document.dispatchEvent(new CustomEvent('italon:cart-refresh'));
  const status = $('#pdp-status');
  if (status) status.textContent = `Выбрана отделка: ${v.surface}. Артикул ${v.code}, цена ${v.price.replace(/<[^>]+>/g, '')}.`;
  if (focus) $(`[data-variant="${code}"]`)?.focus();
}

if (variants.length > 1) {
  const live = document.createElement('p');
  live.id = 'pdp-status'; live.className = 'visually-hidden'; live.setAttribute('aria-live', 'polite');
  live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
  page?.append(live);
  document.addEventListener('click', event => {
    const option = event.target.closest('[data-variant]');
    if (!option || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button) return;
    event.preventDefault();
    select(option.dataset.variant);
  });
  // стрелки — между вариантами (как в группе переключателей)
  $('.pdp__options')?.addEventListener('keydown', event => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const options = $$('[data-variant]', event.currentTarget);
    const i = options.indexOf(document.activeElement);
    if (i < 0) return;
    event.preventDefault();
    const next = options[(i + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length];
    select(next.dataset.variant, { focus: true });
  });
}

// ---------- липкая панель цены (телефон): видна, когда блок покупки вне экрана ----------
const bar = $('[data-pdp-bar]'), buy = $('[data-pdp-buy]');
if (bar && buy && 'IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => {
    const shown = !entry.isIntersecting;
    bar.classList.toggle('is-shown', shown);
    bar.toggleAttribute('inert', !shown);
  }, { rootMargin: '0px 0px -40px 0px' }).observe(buy);
} else if (bar) bar.classList.add('is-shown');
