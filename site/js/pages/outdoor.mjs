// Точка входа /outdoor/: данные материалов вшиты в страницу, оригиналы текстур — из data/lab-originals.json (необязательно).
import { startOutdoor } from '../../shared/outdoor/app.mjs';

const root = document.querySelector('[data-ol]');
if (root) {
  let data = { materials: [], laying: [], root: './' };
  try { data = JSON.parse(document.getElementById('outdoor-data').textContent); } catch (e) { console.error(e); }
  const base = new URL(data.root, location.href), v = document.documentElement.dataset.build || '';
  startOutdoor(root, { ...data, originalsUrl: new URL(`data/lab-originals.json?v=${v}`, base).href })
    .catch(e => { console.error(e); root.dataset.state = 'error'; const s = root.querySelector('[data-status]'); if (s) s.textContent = 'Не удалось запустить визуализатор: ' + e.message; });
}
