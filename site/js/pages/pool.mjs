// Точка входа /pool/: сцены и варианты плитки вшиты в страницу.
import { startPool } from '../../shared/pool/app.mjs';

const root = document.querySelector('[data-pl]');
if (root) {
  let data = null;
  try { data = JSON.parse(document.getElementById('pool-data').textContent); } catch (e) { console.error(e); }
  if (!data) { root.dataset.state = 'error'; }
  else startPool(root, data).catch(e => { console.error(e); root.dataset.state = 'error'; const s = root.querySelector('[data-status]'); if (s) s.textContent = 'Не удалось запустить Бассейн Lab: ' + e.message; });
}
