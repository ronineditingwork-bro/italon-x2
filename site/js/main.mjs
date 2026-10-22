// Точка входа на каждой странице: диалоги, меню, поиск, появление блоков, магазин.
// Страничные скрипты (site/js/pages/<имя>.mjs) выполняются после этого модуля и могут
// использовать window.Italon (см. shop.mjs) или импортировать ../ui.mjs, ../shop.mjs.
import { $, $$, openDialog, setupDialogs, reducedMotion } from './ui.mjs';
import { initShop, loadCatalog } from './shop.mjs';
import { esc, money, normalize, productUrl, titleRu, fmt, media } from '../shared/format.mjs';

const html = document.documentElement;
const root = html.dataset.root || './';

// ---------- появление блоков: [data-reveal] (fade + подъём 20px, один раз) ----------
// data-reveal-delay="120" — задержка в мс; [data-reveal-group] — дети с data-reveal получают шаг 70 мс.
export function initReveal(scope = document) {
  for (const group of $$('[data-reveal-group]', scope)) {
    $$(':scope > [data-reveal], :scope > * > [data-reveal]', group).forEach((el, i) => { if (!el.dataset.revealDelay) el.style.setProperty('--delay', `${Math.min(i, 6) * 70}ms`); });
  }
  for (const el of $$('[data-reveal-delay]', scope)) el.style.setProperty('--delay', `${Number(el.dataset.revealDelay) || 0}ms`);
  const items = $$('[data-reveal]:not(.is-in)', scope);
  if (!html.classList.contains('reveal') || reducedMotion() || !('IntersectionObserver' in window)) { items.forEach(el => el.classList.add('is-in')); return; }
  const io = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  items.forEach(el => io.observe(el));
}

// ---------- меню (мобильное) ----------
function initMenu() {
  document.addEventListener('click', event => {
    if (event.target.closest('[data-menu-open]')) { openDialog('site-menu'); return; }
  });
}

// ---------- поиск по каталогу (клиентский, в диалоге) ----------
function initSearch() {
  const dialog = $('#search-dialog'), input = $('#search-input'), list = $('#search-results'), all = $('#search-all'), status = $('#search-status');
  if (!dialog) return;
  let catalog = null, index = null, timer;
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-search-open]');
    if (!trigger) return;
    event.preventDefault();
    openDialog(dialog);
    input.focus();
    loadCatalog().then(c => { catalog = c; index = c.products.map(p => [p, normalize(`${p.name} ${p.latin} ${p.code} ${p.collection} ${p.format} ${p.finish}`)]); run(); })
      .catch(() => { status.textContent = 'Каталог временно недоступен — откройте страницу каталога.'; });
  });
  const run = () => {
    const query = input.value.trim();
    all.href = `${root}catalog/${query ? `?q=${encodeURIComponent(query)}` : ''}`;
    if (!index || query.length < 2) { list.innerHTML = ''; status.textContent = ''; return; }
    const tokens = normalize(query).split(' ').filter(Boolean);
    const found = index.filter(([, text]) => tokens.every(t => text.includes(t))).map(([p]) => p);
    status.textContent = found.length ? `Найдено: ${found.length}` : 'Ничего не найдено';
    list.innerHTML = found.slice(0, 8).map(p => `<li><a href="${productUrl(root, p.code)}">${p.image ? `<img src="${esc(media(root, p.image.src))}" alt="" width="56" height="56" loading="lazy">` : '<span></span>'}<span><span class="search-results__name">${esc(p.name)}</span><span class="search-results__meta">${esc(titleRu(p.collection))} · арт. ${esc(p.code)}${p.format ? ` · ${esc(fmt(p.format))}` : ''}</span></span><span class="search-results__price">${p.priceKopecks > 0 ? `${money(p.priceKopecks)}/${esc(p.unit)}` : 'Уточнить'}</span></a></li>`).join('')
      || `<li class="t-small" style="padding-block:1rem">По запросу «${esc(query)}» ничего не найдено. Попробуйте артикул или название коллекции.</li>`;
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });
  // Esc в поле type=search сначала очищает его — закрываем диалог сразу
  input.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); dialog.close(); } });
}

// ---------- запуск ----------
setupDialogs();
initMenu();
initSearch();
initShop();
if (window.Italon) window.Italon.reveal = initReveal;
initReveal();
html.classList.add('motion-ready');
// восстановление из bfcache: закрыть открытые диалоги-оверлеи
window.addEventListener('pageshow', event => { if (event.persisted) for (const d of $$('dialog[open]')) d.close(); });
