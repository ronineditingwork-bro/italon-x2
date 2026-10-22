// Точка входа /lab/: данные материалов вшиты в страницу, всё остальное — site/shared/lab/app.mjs.
import { startLab } from '../../shared/lab/app.mjs';

const root = document.querySelector('[data-lab]');
if (root) {
  let materials = [];
  try { materials = JSON.parse(document.getElementById('lab-data').textContent); } catch (e) { console.error(e); }
  startLab(root, { materials, siteUrl: 'italon-x2.ru' }).catch(e => {
    console.error(e); root.dataset.state = 'error';
    const s = root.querySelector('[data-status]'); if (s) s.textContent = 'Не удалось запустить лабораторию: ' + e.message;
  });
}
