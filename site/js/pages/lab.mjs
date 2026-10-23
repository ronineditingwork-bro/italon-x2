// Точка входа /lab/: витрина вшита в страницу, весь каталог и признаки подбора лаборатория читает из data/*.json сайта.
import { startLab } from '../../shared/lab/app.mjs';

const root = document.querySelector('[data-lab]');
if (root) {
  let data = { featured: [], root: './' };
  try { data = JSON.parse(document.getElementById('lab-data').textContent); } catch (e) { console.error(e); }
  const base = new URL(data.root, location.href), v = document.documentElement.dataset.build || '';
  startLab(root, {
    featured: data.featured, root: data.root, siteUrl: 'italon-x2.ru',
    catalogUrl: new URL(`data/catalog.json?v=${v}`, base).href, pickerUrl: new URL(`data/picker.json?v=${v}`, base).href, originalsUrl: new URL(`data/lab-originals.json?v=${v}`, base).href,
  }).catch(e => { console.error(e); root.dataset.state = 'error'; const s = root.querySelector('[data-status]'); if (s) s.textContent = 'Не удалось запустить лабораторию: ' + e.message; });
}
