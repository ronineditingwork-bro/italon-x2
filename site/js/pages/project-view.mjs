// Просмотр проекта по ссылке: токен берётся из фрагмента адреса и отправляется на сервер POST-запросом.
import { esc } from '../../shared/format.mjs';

const root = document.querySelector('[data-pv]');
if (root) {
  const q = s => root.querySelector(s), base = new URL(document.documentElement.dataset.root || './', location.href);
  const token = decodeURIComponent(location.hash.replace(/^#/, '').split('&')[0] || '');
  const fail = text => { root.dataset.state = 'error'; q('[data-pv-title]').textContent = 'Ссылка недоступна'; q('[data-pv-sub]').textContent = text; };
  (async () => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return fail('Ссылка неполная или повреждена. Попросите отправить её ещё раз.');
    const post = (path, body) => fetch(new URL('api/' + path, base), { method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let r; try { r = await post('p/open', { token }); } catch { return fail('Нет связи с сервером. Проверьте интернет и обновите страницу.'); }
    if (!r.ok) return fail(r.status === 404 ? 'Ссылка недействительна или срок её действия закончился. Попросите автора прислать новую.' : 'Сервис временно недоступен. Повторите чуть позже.');
    const p = await r.json();
    document.title = `${p.title} — X2 Outdoor Lab`; q('[data-pv-title]').textContent = p.title;
    q('[data-pv-sub]').textContent = [p.city, p.kind === 'plot' ? 'визуализация на фото участка' : 'готовая сцена'].filter(Boolean).join(' · ');
    q('[data-pv-items]').innerHTML = (p.items || []).map(i => `<li><b>${esc(i.zone)}</b><span>${esc(i.name)} · арт. ${esc(i.code)}</span>${i.area ? `<small>${esc(String(i.area))} м²</small>` : ''}</li>`).join('');
    if (p.hasImage) { try { const ir = await post('p/image', { token }); if (ir.ok) { const u = URL.createObjectURL(await ir.blob()); q('[data-pv-img]').src = u; q('[data-pv-fig]').hidden = false; } } catch { /* картинка не обязательна */ } }
    if (p.scene) q('[data-pv-open]').href = new URL(`outdoor/#s=${p.scene}`, base).href; else q('[data-pv-open]').href = new URL('outdoor/', base).href;
    q('[data-pv-cta]').hidden = false; root.dataset.state = 'ready';
  })();
}
