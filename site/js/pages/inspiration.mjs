// Вдохновение: фильтр по линиям (перекладка мозаики без перезагрузки) и диалог фото
// со ссылками «Смотреть коллекцию» и «Позиции коллекции». Без JS кадры ведут на страницу коллекции.
import { mosaic } from '../../shared/mosaic.mjs';
import { ARROW } from '../../shared/format.mjs';

const grid = document.getElementById('insp-grid');
const filter = document.querySelector('[data-insp-filter]');
const status = document.getElementById('insp-status');
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

if (grid) {
  const all = [...grid.querySelectorAll('.insp')];
  const base = [...all[0]?.classList || []].filter(c => !c.startsWith('m-'));

  const layout = (line, animate) => {
    const list = all.filter(el => line === 'all' || el.dataset.line === line);
    const plan = mosaic(list.map(el => ({ w: +el.dataset.w, h: +el.dataset.h, feature: el.hasAttribute('data-feature') })));
    const frag = document.createDocumentFragment();
    plan.forEach(({ i, cls, ratio }, n) => {
      const el = list[i];
      el.className = [...base.filter(c => c !== 'is-in'), ...cls.split(' '), 'is-in'].join(' ');
      el.style.setProperty('--ratio', ratio);
      const num = el.querySelector('.insp__num');
      if (num) num.textContent = String(n + 1).padStart(2, '0');
      frag.append(el);
    });
    grid.replaceChildren(frag);
    if (animate && !reduced()) { grid.classList.remove('is-entering'); void grid.offsetWidth; grid.classList.add('is-entering'); }
    return list.length;
  };

  if (filter) {
    const buttons = [...filter.querySelectorAll('[data-line]')];
    const names = { all: 'все кадры', italon: 'кадры Italon', x2: 'кадры X2' };
    const apply = (line, user) => {
      if (!names[line]) line = 'all';
      buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.line === line)));
      const n = line === 'all' && !user ? all.length : layout(line, user);
      if (user && status) status.textContent = `Показаны ${names[line]}: ${n}`;
      const params = new URLSearchParams(location.search);
      if (line === 'all') params.delete('line'); else params.set('line', line);
      history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
    };
    filter.hidden = false;
    const initial = new URLSearchParams(location.search).get('line');
    if (initial && initial !== 'all') apply(initial, false);
    filter.addEventListener('click', e => {
      const b = e.target.closest('[data-line]');
      if (!b || b.getAttribute('aria-pressed') === 'true') return;
      apply(b.dataset.line, true);
      const bar = filter.closest('.cx-bar');
      const top = grid.getBoundingClientRect().top - (bar?.getBoundingClientRect().bottom || 0) - 24;
      if (top < 0) window.scrollTo({ top: window.scrollY + top, behavior: reduced() ? 'auto' : 'smooth' });
    });
  }

  // диалог фото: Italon.openScene + вторая ссылка на позиции коллекции в каталоге
  grid.addEventListener('click', async e => {
    const a = e.target.closest('[data-insp]');
    if (!a || !window.Italon?.openScene || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    const id = a.dataset.insp;
    await window.Italon.openScene(id);
    const cap = document.querySelector('#photo-dialog figcaption');
    if (cap && !cap.querySelector('[data-insp-items]')) {
      const link = document.createElement('a');
      link.className = 'link-arrow';
      link.dataset.inspItems = '';
      link.href = new URL(`catalog/?collection=${encodeURIComponent(id)}`, new URL(window.Italon.root || './', location.href)).href;
      link.innerHTML = `Позиции коллекции ${ARROW}`;
      cap.append(' ', link);
    }
  });
}
