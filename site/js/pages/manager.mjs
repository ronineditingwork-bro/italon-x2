// Закрытая карточка проекта: токен менеджера вводится вручную, живёт в sessionStorage до закрытия вкладки.
import { esc } from '../../shared/format.mjs';

const root = document.querySelector('[data-mg]');
if (root) {
  const q = s => root.querySelector(s), base = new URL(document.documentElement.dataset.root || './', location.href);
  const STATUS = { verified: 'Адрес выбран из справочника ГАР/ФИАС', verified_by_manager: 'Адрес проверен менеджером', pending_address_review: 'Адрес ждёт проверки менеджером', rejected: 'Адрес отклонён' };
  let tok = ''; try { tok = sessionStorage.getItem('x2-mgr') || ''; } catch { /* sessionStorage недоступен */ }
  const idFromHash = () => (location.hash.match(/OUT-[A-Z2-9]{8}/) || [''])[0];
  if (idFromHash()) q('[data-mg-id]').value = idFromHash(); if (tok) q('[data-mg-token]').value = tok;
  const get = (path, init = {}) => fetch(new URL('api/manager/' + path, base), { credentials: 'omit', referrerPolicy: 'no-referrer', ...init, headers: { Authorization: 'Bearer ' + tok, ...(init.headers || {}) } });
  const date = t => t ? new Date(t).toLocaleString('ru-RU') : '—';
  async function load() {
    q('[data-mg-msg]').textContent = 'Загружаем…'; const id = q('[data-mg-id]').value.trim();
    const r = await get(`projects/${id}`).catch(() => null); if (!r) { q('[data-mg-msg]').textContent = 'Нет связи с сервером.'; return; }
    if (r.status === 401) { q('[data-mg-msg]').textContent = 'Неверный токен менеджера.'; return; } if (!r.ok) { q('[data-mg-msg]').textContent = 'Проект не найден или удалён клиентом.'; return; }
    const p = await r.json(); q('[data-mg-msg]').textContent = ''; try { sessionStorage.setItem('x2-mgr', tok); } catch { /* не страшно */ }
    const a = p.address || {};
    q('[data-mg-card]').hidden = false; q('[data-mg-card]').innerHTML = `<dl class="mg__dl"><div><dt>Проект</dt><dd>${esc(p.id)} · ${esc(p.title)}</dd></div><div><dt>Телефон</dt><dd><a href="tel:${esc(p.phone)}">${esc(p.phone)}</a> · подтверждён SMS</dd></div>
<div><dt>Адрес</dt><dd>${esc(STATUS[p.addressStatus] || p.addressStatus)}<br>${esc(a.label || '')}${a.fiasId ? `<br><small>ФИАС ${esc(a.fiasId)}, уровень ${esc(String(a.level))}</small>` : ''}${a.lat ? `<br><small>Координаты: ${esc(String(a.lat))}, ${esc(String(a.lon))} ${a.source === 'manual' ? '(отметка клиента)' : ''}</small>` : ''}</dd></div>
<div><dt>Тип</dt><dd>${p.kind === 'plot' ? 'фото клиента' : 'готовая сцена'} · обновлён ${date(p.updatedAt)} · просмотр по ссылке: ${date(p.lastViewAt)}</dd></div><div><dt>Рассылка</dt><dd>${p.marketingConsent ? 'согласие есть' : 'нет согласия'}</dd></div></dl>
<h2>Позиции</h2><ul class="mg__items">${(p.items || []).map(i => `<li><b>${esc(i.zone)}</b>: ${esc(i.name)} · арт. <code>${esc(i.code)}</code> · ${esc(i.format)}${i.area ? ` · ${esc(String(i.area))} м²` : ' · площадь не указана'}</li>`).join('')}</ul>
<div class="mg__actions">${p.hasResult ? '<button class="btn btn--outline" data-img="result">Результат</button>' : ''}${p.hasPhoto ? '<button class="btn btn--outline" data-img="photo">Фото клиента</button>' : ''}${p.addressStatus === 'pending_address_review' ? '<button class="btn" data-review="verified">Подтвердить адрес</button><button class="btn btn--outline" data-review="rejected">Отклонить адрес</button>' : ''}</div><figure data-mg-fig hidden><img alt="" style="max-width:100%"></figure>
<h2>История</h2><ul class="mg__hist">${(p.history || []).map(h => `<li>${date(h.at)} — ${esc(h.event)} ${esc(h.data || '')}</li>`).join('')}</ul>`;
  }
  q('[data-mg-login]').addEventListener('submit', e => { e.preventDefault(); tok = q('[data-mg-token]').value.trim(); history.replaceState(null, '', '#' + q('[data-mg-id]').value.trim()); load(); });
  q('[data-mg-card]').addEventListener('click', async e => {
    const id = q('[data-mg-id]').value.trim(), img = e.target.closest('[data-img]'), rv = e.target.closest('[data-review]');
    if (img) { const r = await get(`projects/${id}/${img.dataset.img}`); if (!r.ok) return; const fig = q('[data-mg-fig]'); fig.hidden = false; fig.querySelector('img').src = URL.createObjectURL(await r.blob()); }
    if (rv) { const note = prompt('Комментарий к решению (необязательно):', '') ?? ''; const r = await get(`projects/${id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: rv.dataset.review, note }) }); if (r.ok) load(); }
  });
  if (tok && idFromHash()) load();
}
