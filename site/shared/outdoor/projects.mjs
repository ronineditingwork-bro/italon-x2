// X2 Outdoor Lab: сохранение проектов. Адрес выбирается из справочника ГАР/ФИАС (подсказки идут через наш сервер), телефон подтверждается SMS-кодом, проект получает
// личную страницу и защищённую ссылку «только просмотр». Пока сервер не настроен (GET api/projects/status → enabled: false), кнопки «Сохранить проект» на странице нет вовсе.
import { esc } from '../format.mjs';

const ADDRESS_STATUS = { verified: 'Адрес подтверждён по справочнику ГАР/ФИАС', verified_by_manager: 'Адрес проверен менеджером', pending_address_review: 'Адрес передан менеджеру на проверку', rejected: 'Адрес не подтверждён' };

export function initProjects(app, root, cfg) {
  const S = app.state, base = new URL(cfg.root || './', location.href), url = p => new URL('api/' + p, base).href;
  const call = async (method, path, body, extra = {}) => {
    try {
      const r = await fetch(url(path), { method, credentials: 'same-origin', headers: { ...(body !== undefined && !extra.raw ? { 'Content-Type': 'application/json' } : {}), ...(extra.type ? { 'Content-Type': extra.type } : {}) }, body: body === undefined ? undefined : extra.raw ? body : JSON.stringify(body) });
      const json = (r.headers.get('Content-Type') || '').includes('json') ? await r.json().catch(() => ({})) : {};
      return { ok: r.ok, status: r.status, json, blob: extra.blob && r.ok ? await r.blob() : null };
    } catch { return { ok: false, status: 0, json: { error: 'Нет связи с сервером. Проверьте интернет и повторите.' } }; }
  };
  const dlg = document.createElement('dialog'); dlg.className = 'ol-dialog ol-project'; dlg.setAttribute('aria-labelledby', 'ol-pr-title'); root.appendChild(dlg);
  const P = { view: 'form', f: { title: '', city: '', cityToken: '', addrMode: 'house', address: '', addressToken: '', manual: '', lat: null, lon: null, phone: '', consent: false, marketing: false, photo: false, code: '' }, busy: false, error: '', info: '', retry: 0, result: null, list: null, phoneMasked: '' };
  let timers = {}, suggest = { city: [], address: [] };

  fetch(url('projects/status'), { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(j => { if (j?.enabled) { S.projects = true; S.projectsAddress = !!j.address; P.photoDays = j.photoDays || 180; app.renderSummary(); } }).catch(() => {});

  const kindNow = () => S.source?.kind === 'plot' ? 'plot' : 'scene';
  function projectState() {
    const zones = Object.fromEntries(S.source.zones.map(z => [z.id, { code: S.zones[z.id].code, mount: S.zones[z.id].mount, layout: S.zones[z.id].layout, direction: S.zones[z.id].direction, joint: S.zones[z.id].joint }]));
    const areas = {}; for (const z of S.source.zones) { const a = z.areaOverride ?? z.area; if (a > 0 && (S.source.kind === 'scene' || z.calibrated || z.areaOverride > 0)) areas[z.id] = Math.round(a * 10) / 10; }
    if (kindNow() === 'scene') return { scene: S.sceneId, zone: S.zoneId, zones, areas };
    const P_ = app.plot.P; return { w: P_.w, h: P_.h, exposure: S.exposure, zones, areas, surfaces: P_.surfaces.filter(s => s.closed).map(s => ({ id: s.id, label: s.label, type: s.type, ring: s.ring, holes: s.holes, mode: s.mode, quad: s.quad, dims: s.dims, horizon: s.horizon, known: s.known })) };
  }
  const jpeg = (canvasOrBlobFn, max) => new Promise(async resolve => { for (const q of [0.88, 0.75, 0.6, 0.45]) { const b = await canvasOrBlobFn(q); if (b && b.size <= max) return resolve(b); } resolve(null); });

  const field = (id, label, input, hint = '') => `<label class="ol-field" for="${id}"><span>${label}</span>${input}${hint ? `<small>${hint}</small>` : ''}</label>`;
  const sugList = (name, items) => items.length ? `<ul class="ol-sug" role="listbox" data-sug="${name}">${items.map((s, i) => `<li><button type="button" role="option" data-sug-pick="${name}" data-i="${i}">${esc(s.label)}</button></li>`).join('')}</ul>` : '';
  function render() {
    const f = P.f, plot = kindNow() === 'plot';
    let body = '';
    if (P.view === 'form' || P.view === 'code') {
      const code = P.view === 'code';
      body = `<p class="ol-hint">Проект сохранится в закрытом разделе Italon X2. Телефон и точный адрес видим только вам и менеджеру; по ссылке для просмотра видны только город и результат.</p>
<form class="ol-pform" data-pform novalidate>
${field('pr-title', 'Название проекта', `<input class="ol-in" id="pr-title" data-f="title" maxlength="80" value="${esc(f.title)}" autocomplete="off" ${code ? 'disabled' : ''}>`)}
${field('pr-city', 'Город или населённый пункт', `<input class="ol-in" id="pr-city" data-f="city" maxlength="100" value="${esc(f.city)}" autocomplete="off" role="combobox" aria-expanded="${suggest.city.length > 0}" ${code ? 'disabled' : ''}>`, f.cityToken ? '✓ выбран из справочника' : S.projectsAddress ? 'Начните вводить и выберите из списка' : 'Проверка по справочнику временно недоступна — менеджер проверит вручную')}${sugList('city', suggest.city)}
<fieldset class="ol-radios" ${code ? 'disabled' : ''}><legend>Объект</legend>
${[['house', 'Дом (улица и номер)'], ['plot', 'Земельный участок'], ['manual', 'Нет в справочнике (СНТ, новый посёлок)']].filter(([id]) => S.projectsAddress || id === 'manual').map(([id, l]) => `<label><input type="radio" name="addr-mode" data-addr-mode="${id}" ${f.addrMode === id || (!S.projectsAddress && id === 'manual') ? 'checked' : ''}><span>${l}</span></label>`).join('')}</fieldset>
${f.addrMode !== 'manual' && S.projectsAddress ? field('pr-addr', f.addrMode === 'plot' ? 'Земельный участок' : 'Улица и дом', `<input class="ol-in" id="pr-addr" data-f="address" maxlength="150" value="${esc(f.address)}" autocomplete="off" role="combobox" ${code || !f.cityToken ? 'disabled' : ''}>`, f.addressToken ? '✓ адрес выбран из справочника ГАР/ФИАС' : f.cityToken ? 'Выберите вариант из списка' : 'Сначала выберите город') + sugList('address', suggest.address)
        : field('pr-manual', 'Опишите расположение', `<textarea class="ol-in" id="pr-manual" data-f="manual" rows="3" maxlength="200" ${code ? 'disabled' : ''}>${esc(f.manual)}</textarea>`, 'Например: СНТ «Ромашка», участок 12, второй въезд от трассы. Менеджер проверит и подтвердит адрес.') + `<button type="button" class="ol-btn ol-btn--line" data-geo>Указать моё местоположение</button>${f.lat ? '<small>Местоположение добавлено (это ваша отметка, а не подтверждение владения).</small>' : ''}`}
${field('pr-phone', 'Телефон (мобильный)', `<input class="ol-in" id="pr-phone" data-f="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 900 000-00-00" maxlength="30" value="${esc(f.phone)}" ${code ? 'disabled' : ''}>`)}
<label class="ol-check"><input type="checkbox" data-f="consent" ${f.consent ? 'checked' : ''} ${code ? 'disabled' : ''}><span>Я согласен(на) на обработку персональных данных (имя проекта, телефон, адрес) для сохранения проекта и связи по расчёту. <a href="${new URL('privacy/', base).href}" target="_blank" rel="noopener">Политика обработки данных</a></span></label>
<label class="ol-check"><input type="checkbox" data-f="marketing" ${f.marketing ? 'checked' : ''} ${code ? 'disabled' : ''}><span>Хочу получать предложения Italon X2 (необязательно)</span></label>
${plot ? `<label class="ol-check"><input type="checkbox" data-f="photo" ${f.photo ? 'checked' : ''} ${code ? 'disabled' : ''}><span>Сохранить копию моего фото в закрытом хранилище Italon X2, чтобы вернуться к проекту (хранится до ${P.photoDays || 180} дней, метаданные удаляются). Без этой отметки фото остаётся только на вашем устройстве.</span></label>` : ''}
${code ? `${field('pr-code', 'Код из SMS', `<input class="ol-in" id="pr-code" data-f="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" value="${esc(f.code)}">`, `Отправлен на ${esc(P.phoneMasked)}. ${P.retry > 0 ? `Повторить можно через ${P.retry} с.` : '<button type="button" class="ol-link" data-resend>Отправить код ещё раз</button>'}`)}<button type="submit" class="ol-btn ol-btn--solid" ${P.busy ? 'disabled' : ''}>${P.busy ? 'Сохраняем…' : 'Подтвердить и сохранить'}</button>` : `<button type="submit" class="ol-btn ol-btn--solid" ${P.busy ? 'disabled' : ''}>${P.busy ? 'Отправляем код…' : 'Получить код по SMS'}</button>`}
</form>`;
    } else if (P.view === 'done') {
      const r = P.result; body = `<p class="ol-pdone"><b>Проект сохранён</b><br>Номер проекта: <code>${esc(r.id)}</code></p><p class="ol-hint">${esc(ADDRESS_STATUS[r.addressStatus] || '')}. ${r.lead ? 'Менеджер получил заявку и свяжется с вами.' : 'Мы получили проект.'}</p>
${r.share ? `<label class="ol-field"><span>Ссылка для просмотра (без телефона и точного адреса)</span><input class="ol-in" readonly value="${esc(r.share.url)}" data-select></label><div class="ol-row"><button type="button" class="ol-btn ol-btn--solid" data-copy="${esc(r.share.url)}">Скопировать ссылку</button><a class="ol-btn ol-btn--line" href="${esc(r.share.url)}" target="_blank" rel="noopener noreferrer">Открыть</a></div><p class="ol-hint">Ссылка действует до ${new Date(r.share.expiresAt).toLocaleDateString('ru-RU')}. Отозвать её можно в «Мои проекты».</p>` : ''}
<button type="button" class="ol-btn ol-btn--line" data-dialog-close>Закрыть</button>`;
    } else if (P.view === 'login') {
      body = `<p class="ol-hint">Введите номер, на который сохраняли проекты, — отправим код по SMS.</p><form data-lform novalidate>${field('lg-phone', 'Телефон', `<input class="ol-in" id="lg-phone" data-f="phone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(f.phone)}">`)}${P.codeSent ? field('lg-code', 'Код из SMS', `<input class="ol-in" id="lg-code" data-f="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" value="${esc(f.code)}">`) : `<label class="ol-check"><input type="checkbox" data-f="consent" ${f.consent ? 'checked' : ''}><span>Согласен(на) на обработку персональных данных для входа. <a href="${new URL('privacy/', base).href}" target="_blank" rel="noopener">Политика</a></span></label>`}<button type="submit" class="ol-btn ol-btn--solid" ${P.busy ? 'disabled' : ''}>${P.codeSent ? 'Войти' : 'Получить код'}</button></form>`;
    } else if (P.view === 'list') {
      const list = P.list || [];
      body = `<p class="ol-hint">${esc(P.phoneMasked)} · <button type="button" class="ol-link" data-logout>Выйти</button></p>${list.length ? `<ul class="ol-plist">${list.map(p => `<li><div><b>${esc(p.title)}</b><small>${esc(p.city || '')} · ${p.kind === 'plot' ? 'ваше фото' : 'готовая сцена'} · ${new Date(p.updatedAt).toLocaleDateString('ru-RU')} · <code>${esc(p.id)}</code></small><small>${esc(ADDRESS_STATUS[p.addressStatus] || '')}</small></div><div class="ol-row"><button type="button" class="ol-btn ol-btn--line" data-open-project="${esc(p.id)}">Открыть</button><button type="button" class="ol-btn ol-btn--line" data-share-project="${esc(p.id)}">Ссылка</button><button type="button" class="ol-btn ol-btn--line" data-revoke-project="${esc(p.id)}">Отозвать ссылки</button><button type="button" class="ol-btn ol-btn--line" data-delete-project="${esc(p.id)}">Удалить</button></div>${P.shared?.id === p.id ? `<input class="ol-in" readonly value="${esc(P.shared.url)}" data-select>` : ''}</li>`).join('')}</ul>` : '<p class="ol-hint">Сохранённых проектов пока нет.</p>'}`;
    }
    dlg.innerHTML = `<div class="ol-dialog__head"><h2 id="ol-pr-title">${P.view === 'list' ? 'Мои проекты' : P.view === 'login' ? 'Вход по SMS' : P.view === 'done' ? 'Готово' : 'Сохранить проект'}</h2><button type="button" class="ol-tool ol-tool--icon" data-dialog-close aria-label="Закрыть">✕</button></div>${P.error ? `<p class="ol-perr" role="alert">${esc(P.error)}</p>` : ''}${P.info ? `<p class="ol-hint" role="status">${esc(P.info)}</p>` : ''}${body}`;
  }
  const open = view => { P.view = view; P.error = ''; P.info = ''; render(); if (!dlg.open) dlg.showModal(); };
  const fail = r => { P.error = r.json?.error || (r.status === 401 ? 'Подтвердите телефон, чтобы продолжить.' : 'Не получилось. Повторите попытку.'); P.busy = false; render(); };
  const tick = () => { clearInterval(timers.retry); timers.retry = setInterval(() => { P.retry = Math.max(0, P.retry - 1); if (P.view === 'form' || P.view === 'code') { const el = dlg.querySelector('[data-resend]'), hint = dlg.querySelector('#pr-code')?.closest('label')?.querySelector('small'); if (!P.retry) { clearInterval(timers.retry); render(); } else if (hint) hint.innerHTML = `Отправлен на ${esc(P.phoneMasked)}. Повторить можно через ${P.retry} с.`; void el; } }, 1000); };

  // ---------- подсказки адреса
  async function lookup(name) {
    const f = P.f, q = name === 'city' ? f.city : f.address; if (q.trim().length < 2) { suggest[name] = []; render(); return; }
    const r = await call('POST', 'projects/address/suggest', { query: q, mode: name === 'city' ? 'city' : f.addrMode, cityToken: name === 'address' ? f.cityToken : undefined });
    suggest[name] = r.ok ? r.json.items || [] : []; if (!r.ok && r.json?.manual) { S.projectsAddress = false; P.f.addrMode = 'manual'; } render(); dlg.querySelector(name === 'city' ? '#pr-city' : '#pr-addr')?.focus();
  }
  dlg.addEventListener('input', e => {
    const k = e.target.dataset.f; if (!k) return; const f = P.f;
    f[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (k === 'city') { f.cityToken = ''; f.addressToken = ''; f.address = ''; clearTimeout(timers.c); timers.c = setTimeout(() => lookup('city'), 250); }            // правка строки после выбора сбрасывает статус выбора
    if (k === 'address') { f.addressToken = ''; clearTimeout(timers.a); timers.a = setTimeout(() => lookup('address'), 250); }
  });
  dlg.addEventListener('change', e => { if (e.target.dataset.f && e.target.type === 'checkbox') { P.f[e.target.dataset.f] = e.target.checked; } const m = e.target.dataset.addrMode; if (m) { P.f.addrMode = m; P.f.addressToken = ''; P.f.address = ''; suggest.address = []; render(); } });
  dlg.addEventListener('click', async e => {
    const t = e.target;
    if (t === dlg || t.closest('[data-dialog-close]')) { dlg.close(); return; }
    const pick = t.closest('[data-sug-pick]'); if (pick) { const n = pick.dataset.sugPick, it = suggest[n][Number(pick.dataset.i)]; if (n === 'city') { P.f.city = it.label; P.f.cityToken = it.token; } else { P.f.address = it.label; P.f.addressToken = it.token; } suggest[n] = []; render(); return; }
    if (t.closest('[data-geo]')) { navigator.geolocation?.getCurrentPosition(pos => { P.f.lat = pos.coords.latitude; P.f.lon = pos.coords.longitude; render(); }, () => { P.info = 'Не удалось определить местоположение. Опишите расположение словами.'; render(); }, { timeout: 8000 }); return; }
    const copy = t.closest('[data-copy]'); if (copy) { try { await navigator.clipboard.writeText(copy.dataset.copy); app.toast('Ссылка скопирована'); } catch { dlg.querySelector('[data-select]')?.select(); } return; }
    if (t.closest('[data-resend]')) { await sendCode(); return; }
    if (t.closest('[data-logout]')) { await call('POST', 'projects/logout', {}); P.list = null; open('login'); return; }
    const op = t.closest('[data-open-project]'); if (op) { await openProject(op.dataset.openProject); return; }
    const sp = t.closest('[data-share-project]'); if (sp) { const r = await call('POST', `projects/${sp.dataset.shareProject}/shares`, { days: 30 }); if (!r.ok) return fail(r); P.shared = { id: sp.dataset.shareProject, url: r.json.url }; render(); return; }
    const rp = t.closest('[data-revoke-project]'); if (rp) { const l = await call('GET', `projects/${rp.dataset.revokeProject}/shares`); for (const s of (l.json.shares || []).filter(s => !s.revokedAt && s.expiresAt > Date.now())) await call('DELETE', `projects/${rp.dataset.revokeProject}/shares/${s.id}`); P.shared = null; P.info = 'Все ссылки на проект отозваны.'; render(); return; }
    const dp = t.closest('[data-delete-project]'); if (dp) { if (!confirm('Удалить проект, фото и все ссылки? Это нельзя отменить.')) return; const r = await call('DELETE', `projects/${dp.dataset.deleteProject}`); if (!r.ok) return fail(r); await loadList(); return; }
  });
  dlg.addEventListener('submit', async e => {
    e.preventDefault(); if (P.busy) return;
    if (e.target.matches('[data-lform]')) return loginSubmit();
    if (P.view === 'form') return sendCode(true);
    if (P.view === 'code') return verifyAndSave();
  });

  // ---------- вход по SMS и сохранение
  function formError() {
    const f = P.f; if (f.title.trim().length < 2) return 'Укажите название проекта.'; if (f.city.trim().length < 2) return 'Укажите город или населённый пункт.';
    if (S.projectsAddress && f.addrMode !== 'manual') { if (!f.cityToken) return 'Выберите город из списка подсказок.'; if (!f.addressToken) return f.addrMode === 'plot' ? 'Выберите земельный участок из списка. Если его нет в справочнике, выберите «Нет в справочнике».' : 'Выберите улицу и дом из списка. Если адреса нет в справочнике, выберите «Нет в справочнике».'; }
    else if (f.manual.trim().length < 10) return 'Опишите расположение подробнее: населённый пункт, улицу или СНТ, участок.';
    if (!/^\+?[78]?[\s(-]*9\d{2}/.test(f.phone.replace(/\s/g, '')) && f.phone.replace(/\D/g, '').length < 10) return 'Укажите мобильный телефон.';
    if (!f.consent) return 'Нужно согласие на обработку персональных данных.'; return '';
  }
  async function sendCode(first = false) {
    P.error = formError(); if (P.error) { render(); return; }
    P.busy = true; P.info = ''; render(); const r = await call('POST', 'projects/otp/send', { phone: P.f.phone, consentPd: true }); P.busy = false;
    if (!r.ok) { if (r.status === 429 && r.json.retryAfter) { P.retry = r.json.retryAfter; P.view = 'code'; P.error = ''; P.info = r.json.error; render(); tick(); return; } return fail(r); }
    P.phoneMasked = r.json.phone; P.retry = r.json.retryAfter || 60; P.view = 'code'; P.error = ''; P.f.code = ''; render(); tick(); dlg.querySelector('#pr-code')?.focus(); void first;
  }
  async function verifyAndSave() {
    const f = P.f; if (!/^\d{6}$/.test(f.code.replace(/\D/g, ''))) { P.error = 'Введите шестизначный код из SMS.'; render(); return; }
    P.busy = true; P.error = ''; render();
    const v = await call('POST', 'projects/otp/verify', { phone: f.phone, code: f.code }); if (!v.ok) return fail(v);
    const body = { title: f.title, kind: kindNow(), state: projectState(), consentPd: true, marketing: f.marketing, photoConsent: kindNow() === 'plot' && f.photo,
      address: S.projectsAddress && f.addrMode !== 'manual' ? { token: f.addressToken, cityToken: f.cityToken } : { cityToken: f.cityToken || undefined, manual: { text: f.manual, city: f.city, lat: f.lat, lon: f.lon } }, ...(P.savedId ? { id: P.savedId } : {}) };
    const r = await call('POST', 'projects', body); if (!r.ok) return fail(r);
    P.savedId = r.json.id;
    if (body.photoConsent && app.plot?.P.photo) { const blob = await jpeg(q => new Promise(res => app.plot.P.photo.toBlob(res, 'image/jpeg', q)), 3_400_000); if (blob) await call('PUT', `projects/${r.json.id}/photo`, blob, { raw: true, type: 'image/jpeg' }); }
    const res = await jpeg(q => app.snapshotBlob({ maxSide: 1600, quality: q }), 1_700_000); if (res) await call('PUT', `projects/${r.json.id}/result`, res, { raw: true, type: 'image/jpeg' });
    const sh = await call('POST', `projects/${r.json.id}/shares`, { days: 30 });
    P.result = { id: r.json.id, addressStatus: r.json.addressStatus, lead: r.json.lead, share: sh.ok ? sh.json : null }; P.busy = false; P.savedId = null; open('done');
  }
  async function loginSubmit() {
    const f = P.f; P.busy = true; P.error = ''; render();
    if (!P.codeSent) { if (!f.consent) { P.error = 'Нужно согласие на обработку персональных данных.'; P.busy = false; return render(); } const r = await call('POST', 'projects/otp/send', { phone: f.phone, consentPd: true }); if (!r.ok) return fail(r); P.codeSent = true; P.phoneMasked = r.json.phone; P.busy = false; render(); return; }
    const v = await call('POST', 'projects/otp/verify', { phone: f.phone, code: f.code }); if (!v.ok) return fail(v); P.codeSent = false; P.phoneMasked = v.json.phone; await loadList();
  }
  async function loadList() { const r = await call('GET', 'projects/me'); if (r.status === 401) { P.busy = false; return open('login'); } if (!r.ok) return fail(r); P.list = r.json.projects; P.phoneMasked = r.json.phone; P.busy = false; open('list'); }
  async function openProject(id) {
    const r = await call('GET', `projects/${id}`); if (!r.ok) return fail(r); const p = r.json, st = p.state; dlg.close();
    if (p.kind === 'scene') { if (root.dataset.mode === 'plot') { S.sceneId = st.scene; app.plot.setMode('scene'); await new Promise(res => setTimeout(res, 300)); } await app.loadScene(st.scene, { zones: st.zones, zone: st.zone }); for (const [zid, a] of Object.entries(st.areas || {})) { const z = S.source.zones.find(z => z.id === zid); if (z) z.areaOverride = a; } app.renderSummary(); return; }
    if (!p.hasPhoto) { app.say('Фото этого проекта не сохранялось: загрузите его снова, разметка не сохранена без фото.', 'warn'); app.plot.setMode('plot', true); return; }
    const ph = await call('GET', `projects/${id}/photo`, undefined, { blob: true }); if (!ph.ok) return fail(ph);
    const u = URL.createObjectURL(ph.blob); const img = await app.loadImage(u); URL.revokeObjectURL(u);
    const k = st.w / img.naturalWidth, canvas = app.drawPhoto(img, 2048); void k;
    app.plot.startWith(canvas, { surfaces: st.surfaces.map(s => ({ ...s, closed: true, hole: [] })) }); Object.assign(S.zones, st.zones); S.exposure = st.exposure || 1; await app.plot.doRebuild();
    for (const [zid, a] of Object.entries(st.areas || {})) { const z = S.source.zones.find(z => z.id === zid); if (z) z.areaOverride = a; } app.sync();
  }

  root.addEventListener('click', e => {
    if (e.target.closest('[data-project-save]')) {
      if (!S.source?.zones.length) { app.say('Сначала выберите поверхность и материал.', 'warn'); return; }
      const m = app.matOf(S.zones[S.zoneId].code); P.f.title = P.f.title || `${S.source.kind === 'scene' ? S.source.title : 'Мой участок'} · ${m.material.name}`; P.result = null; suggest = { city: [], address: [] }; open('form');
    } else if (e.target.closest('[data-project-list]')) { loadList().then(() => { if (!dlg.open) dlg.showModal(); }); }
  });
  return { dlg, P, open, loadList };
}
