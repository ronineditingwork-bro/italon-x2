// X2 Outdoor Lab: «Отправить менеджеру в Telegram». Без регистрации: контакт, согласие, картинка и спецификация уходят одним запросом в бот салона (POST api/outdoor/send).
import { esc } from '../format.mjs';

export function initSend(app, root, cfg) {
  const S = app.state, base = new URL(cfg.root || './', location.href);
  const dlg = document.createElement('dialog'); dlg.className = 'ol-dialog ol-project'; dlg.setAttribute('aria-labelledby', 'ol-sd-title'); root.appendChild(dlg);
  const F = { name: '', contact: '', note: '', consent: false }, V = { busy: false, error: '', done: false };
  const plot = () => S.source?.kind === 'plot';

  function render() {
    const body = V.done ? `<p class="ol-pdone"><b>Проект отправлен менеджеру.</b></p><p class="ol-hint">Мы свяжемся с вами по указанному контакту. Это не заказ: расчёт и цену менеджер подтвердит отдельно.</p><button type="button" class="ol-btn ol-btn--line" data-dialog-close>Закрыть</button>`
      : `<p class="ol-hint">Менеджер Italon X2 получит в Telegram картинку и спецификацию вашего проекта${plot() ? ' (на картинке — ваше фото участка)' : ''}. Регистрация не нужна.</p>
<form class="ol-pform" data-sform novalidate>
<label class="ol-field" for="sd-name"><span>Как к вам обращаться (необязательно)</span><input class="ol-in" id="sd-name" data-f="name" maxlength="80" autocomplete="name" value="${esc(F.name)}"></label>
<label class="ol-field" for="sd-contact"><span>Телефон или Telegram</span><input class="ol-in" id="sd-contact" data-f="contact" maxlength="60" autocomplete="tel" placeholder="+7 900 000-00-00 или @name" value="${esc(F.contact)}"></label>
<label class="ol-field" for="sd-note"><span>Комментарий (необязательно)</span><textarea class="ol-in" id="sd-note" data-f="note" rows="3" maxlength="500">${esc(F.note)}</textarea></label>
<label class="ol-check"><input type="checkbox" data-f="consent" ${F.consent ? 'checked' : ''}><span>Согласен(на) передать контакт, картинку и спецификацию менеджеру Italon X2 для связи по расчёту. <a href="${esc(new URL('privacy/', base).href)}" target="_blank" rel="noopener">Как мы обращаемся с данными</a></span></label>
${V.error ? `<p class="ol-perr" role="alert">${esc(V.error)}</p>` : ''}
<div class="ol-row"><button type="submit" class="ol-btn ol-btn--solid" ${V.busy ? 'disabled' : ''}>${V.busy ? 'Отправляем…' : 'Отправить в Telegram'}</button><button type="button" class="ol-btn ol-btn--line" data-dialog-close>Отмена</button></div></form>`;
    dlg.innerHTML = `<div class="ol-dialog__head"><h2 id="ol-sd-title">Отправить проект менеджеру</h2><button type="button" class="ol-tool ol-tool--icon" data-dialog-close aria-label="Закрыть">×</button></div>${body}`;
  }
  async function jpeg() { for (const [side, q] of [[1800, .85], [1500, .75], [1200, .65], [900, .55]]) { const b = await app.snapshotBlob({ maxSide: side, quality: q }); if (b && b.size <= 2_000_000) return b; } return null; }
  async function submit() {
    if (V.busy) return;
    if (!/^\+?[\d\s()-]{10,}$/.test(F.contact.trim()) && !/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(F.contact.trim())) { V.error = 'Укажите телефон или имя в Telegram (например, @name).'; render(); return; }
    if (!F.consent) { V.error = 'Нужно согласие на передачу данных менеджеру.'; render(); return; }
    V.busy = true; V.error = ''; render();
    try {
      const image = await jpeg();
      if (!image) throw new Error('Не удалось подготовить изображение проекта. Повторите попытку.');
      const form = new FormData();
      form.set('contact', F.contact.trim()); form.set('name', F.name.trim()); form.set('note', F.note.trim()); form.set('consent', '1'); form.set('kind', plot() ? 'plot' : 'scene'); form.set('spec', app.specText());
      form.set('image', image, 'italon-x2-outdoor.jpg');
      const r = await fetch(new URL('api/outdoor/send', base).href, { method: 'POST', body: form, credentials: 'same-origin' }), j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Не удалось отправить. Повторите позже.');
      V.done = true; F.note = '';
    } catch (e) { V.error = e.message || 'Нет связи с сервером. Проверьте интернет и повторите.'; }
    V.busy = false; render();
  }
  dlg.addEventListener('input', e => { const k = e.target.dataset.f; if (k) F[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; });
  dlg.addEventListener('submit', e => { e.preventDefault(); submit(); });
  dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-dialog-close]')) dlg.close(); });
  root.addEventListener('click', e => { if (e.target.closest('[data-send]')) { V.done = false; V.error = ''; render(); dlg.showModal(); } });
  return { open: () => root.querySelector('[data-send]')?.click() };
}
