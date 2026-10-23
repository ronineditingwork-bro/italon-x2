// X2 Outdoor Lab: поведение страницы. Один «источник» кадра (готовая сцена или фото посетителя) — одни и те же настройки, движок и расчёт.
// source = { kind, id, title, w, h, photo (canvas), zones: [{ id, label, type, rings, H, sign, ref, area (м² или null), areaNote }], masks, focus }.
import { createEngine, fitView } from './engine.mjs';
import { SCENES, sceneById, sceneHomography } from './scenes.mjs';
import { buildZoneMasks } from './mask.mjs';
import { maskArea } from './geometry.mjs';
import { ZONE_TYPES, MOUNTS, JOINTS, LAYOUTS, DIRECTIONS, optionStates, normalizeSettings, shaderParams, coverage, wasteFraction, MOUNT_BY_ID, JOINT_BY_ID, LAYOUT_BY_ID, DIRECTION_BY_ID } from './options.mjs';
import { findByCode, variantOf, packsFor, applyTextures, textureOf } from './materials.mjs';
import { encode, decode } from './state.mjs';
import { esc, money, number, fmt, normalize } from '../format.mjs';
import { ICONS } from './ui.mjs';
import { initPlot } from './plot.mjs';
import { initProjects } from './projects.mjs';

const DEFAULT_CODE = '610010004089';           // Магма Сильвер 60×120
const FEATURED_NAMES = ['Магма Сильвер', 'Магма Графит', 'Фоссил Дезерт', 'Материя Магнезио', 'Миллениум Блэк', 'Авангард Сильвер', 'Нордика Роуп', 'Клаймб Рок', 'Нл-Вуд Нлв. Олив', 'Аура Кл. Оак'];
const FORMAT_LABEL = f => fmt(f).replace(/\s+/g, ' ');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hashCode = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return (Math.abs(h) % 997) / 997; };

export function loadImage(src) {
  return new Promise((resolve, reject) => { const i = new Image(); i.decoding = 'async'; i.onload = () => resolve(i); i.onerror = () => reject(new Error('не удалось загрузить ' + src)); i.src = src; });
}
/** Фото → canvas ≤ maxSide с пикселями (для масок и текстуры). */
export function drawPhoto(img, maxSide = 2048) {
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height)), w = Math.max(2, Math.round((img.naturalWidth || img.width) * k)), h = Math.max(2, Math.round((img.naturalHeight || img.height) * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, w, h); return c;
}

export async function startOutdoor(root, cfg) {
  const $ = (s, r = root) => r.querySelector(s), $$ = (s, r = root) => [...r.querySelectorAll(s)];
  const mobileTex = matchMedia('(max-width: 820px)').matches || (navigator.deviceMemory && navigator.deviceMemory <= 2);
  let manifest = null; try { if (cfg.originalsUrl) { const r = await fetch(cfg.originalsUrl, { credentials: 'omit' }); if (r.ok) manifest = await r.json(); } } catch { /* оригиналов нет — работаем с фото каталога */ }
  const M = applyTextures(cfg.materials, manifest, { mobile: mobileTex, root: cfg.root || './' });
  const canvas = $('[data-canvas]'), overlay = $('[data-overlay]'), stage = $('[data-stage]'), statusEl = $('[data-status]');
  const engine = createEngine(canvas);
  const say = (t, kind = '') => { statusEl.textContent = t || ''; statusEl.dataset.kind = kind; };
  if (!engine) { root.dataset.state = 'nogl'; say('Ваш браузер не поддерживает WebGL 2, поэтому интерактивная визуализация недоступна. Откройте страницу в современном Chrome, Safari или Edge.', 'error'); return null; }

  const S = {
    mode: 'scene', source: null, sceneId: null, zoneId: null, zones: {}, sync: true,
    compare: { mode: 'off', split: 0.5, code2: null }, focus: [0.5, 0.5], zoom: 1, exposure: 1, hover: null, flash: 0, pick: null, tiles: new Map(), token: 0,
  };
  const matOf = code => findByCode(M, code);
  const toast = t => (window.Italon?.toast ? window.Italon.toast(t) : say(t));

  // ------------------------------------------------------------------ настройки зон
  const defaults = type => normalizeSettings({ format: matOf(DEFAULT_CODE).format, mount: 'adhesive', layout: 'offset', direction: 'along', joint: 'narrow' }, { zoneType: type, material: matOf(DEFAULT_CODE).material });
  const fullOf = z => { const f = matOf(z.code); return { format: f.format, mount: z.mount, layout: z.layout, direction: z.direction, joint: z.joint, material: f.material, variant: f.variant }; };
  function inherit(zone, base) {
    const f = matOf(base.code), r = normalizeSettings({ format: f.format, mount: base.mount, layout: base.layout, direction: base.direction, joint: base.joint }, { zoneType: zone.type, material: f.material }).settings;
    return { code: variantOf(f.material, r.format).code, mount: r.mount, layout: r.layout, direction: r.direction, joint: r.joint };
  }
  /** Площадь зон на плоскости: считаем только там, где масштаб известен (сцена — оценка камеры, фото — заданный пользователем масштаб). */
  function recomputeAreas() {
    const src = S.source; if (!src?.masks) return;
    src.zones.forEach((z, i) => {
      if (z.calibrated === false) { z.area = null; return; }
      const a = maskArea(z.H, src.masks.data, src.w, src.h, { step: Math.max(2, Math.round(Math.max(src.w, src.h) / 700)), channel: i, stride: 4, maxDist: src.kind === 'plot' ? 150 : 80, sign: z.sign || 0 });
      z.area = a.reliable ? (src.kind === 'scene' ? Math.round(a.area * 2) / 2 : Math.round(a.area * 10) / 10) : null;
    });
  }
  function fresh(zone) {
    const d = defaults(zone.type).settings;
    return { code: variantOf(matOf(DEFAULT_CODE).material, d.format).code, mount: d.mount, layout: d.layout, direction: d.direction, joint: d.joint };
  }
  /** Изменить настройки зоны (patch — любые поля или code); привести к допустимому сочетанию; при «одинаково для всех» — размножить. */
  function change(patch, zoneIds = null) {
    const ids = zoneIds || (S.sync ? S.source.zones.map(z => z.id) : [S.zoneId]), notes = [];
    for (const id of ids) {
      const zone = S.source.zones.find(z => z.id === id), cur = S.zones[id] || fresh(zone), f = matOf(patch.code || cur.code);
      const want = { format: patch.format || f.format, mount: patch.mount || cur.mount, layout: patch.layout || cur.layout, direction: patch.direction || cur.direction, joint: patch.joint || cur.joint };
      if (patch.mount && !patch.joint) want.joint = MOUNT_BY_ID[patch.mount].joints.includes(want.joint) ? want.joint : ({ grass: 'grass', gravel: 'gravel' }[patch.mount] || 'narrow');
      if (patch.layout === 'stepping' && !patch.joint) want.joint = want.mount === 'grass' ? 'grass' : want.mount === 'gravel' ? 'gravel' : want.joint;
      const r = normalizeSettings(want, { zoneType: zone.type, material: f.material });
      S.zones[id] = { code: variantOf(f.material, r.settings.format).code, mount: r.settings.mount, layout: r.settings.layout, direction: r.settings.direction, joint: r.settings.joint };
      if (id === S.zoneId) notes.push(...r.notes);
    }
    if (notes.length) say(notes[0] + '.'); else say('');
    sync();
  }
  function setMaterial(material) {
    const cur = S.zones[S.zoneId], f = matOf(cur.code);
    change({ code: variantOf(material, material.formats.includes(f.format) ? f.format : material.formats[0]).code });
  }

  // ------------------------------------------------------------------ плитки (текстуры) и отрисовка
  function tileFor(variant) {
    const t = textureOf(variant);
    if (!S.tiles.has(t.src)) S.tiles.set(t.src, loadImage(t.src).catch(() => loadImage(variant.image)).then(img => engine.createTile(img)));
    return S.tiles.get(t.src);
  }
  let rafId = 0; const draw = () => { rafId = 0; if (!S.source) return; layoutView(); engine.render(); paintOverlay(); };
  const requestRender = () => { if (!rafId) rafId = requestAnimationFrame(draw); };
  function layoutView() {
    const plot = S.source.kind === 'plot', raw = S.source.w / S.source.h, ar = Math.round((plot ? clamp(raw, 0.75, 2.2) : clamp(raw, 1.3, 2.2)) * 100) / 100, arm = plot ? Math.round(clamp(raw, 0.9, 1.6) * 100) / 100 : 1.33;
    if (stage.dataset.ar !== `${ar}/${arm}`) { stage.dataset.ar = `${ar}/${arm}`; stage.style.setProperty('--ol-ar', ar); stage.style.setProperty('--ol-ar-m', arm); }
    const r = stage.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    engine.resize(r.width, r.height, dpr);
    const c = engine.size; if (overlay.width !== c.w || overlay.height !== c.h) { overlay.width = c.w; overlay.height = c.h; }
    S.view = fitView(c.w, c.h, S.source.w, S.source.h, { fit: plot ? 'contain' : 'cover', focus: S.focus, zoom: S.zoom });
    engine.setView(S.view);
  }
  const toPhoto = (cx, cy) => { const k = engine.size.w / canvas.clientWidth; return [S.view.originX + cx * k * S.view.scale, S.view.originY + cy * k * S.view.scale]; };
  const fromPhoto = (x, y) => [(x - S.view.originX) / S.view.scale, (y - S.view.originY) / S.view.scale];

  let syncToken = 0;
  async function sync() {
    if (!S.source) return;
    const token = ++syncToken;
    for (const v of [0, 1]) for (let i = 0; i < 4; i++) engine.setZone(v, i, null);
    const jobs = [];
    S.source.zones.forEach((zone, i) => {
      const cur = S.zones[zone.id] || (S.zones[zone.id] = fresh(zone));
      const mk = async (code, variant) => {
        const f = matOf(code); if (!f) return;
        const settings = { format: f.format, mount: cur.mount, layout: cur.layout, direction: cur.direction, joint: cur.joint };
        const norm = normalizeSettings(settings, { zoneType: zone.type, material: f.material }).settings;
        const tile = await tileFor(f.variant);
        if (token !== syncToken) return;
        engine.setZone(variant, i, { H: zone.H, sign: zone.sign, tile, params: shaderParams(norm), ref: zone.ref, seed: hashCode(f.variant.code), exposure: zone.exposure ?? 1, mode: zone.gridMode ? 1 : 0 });
      };
      jobs.push(mk(cur.code, 0));
      if (S.compare.mode === 'ab' && S.compare.code2) {
        const f2 = matOf(S.compare.code2), f = matOf(cur.code), fmtOk = f2.material.formats.includes(f.format) ? f.format : f2.material.formats[0];
        jobs.push(mk(variantOf(f2.material, fmtOk).code, 1));
      }
    });
    try { await Promise.all(jobs); } catch (e) { console.error(e); say('Не удалось загрузить текстуру материала. Проверьте соединение и повторите.', 'error'); }
    if (token !== syncToken) return;
    engine.setCompare(S.compare.mode, S.compare.split); engine.setExposure(S.exposure);
    renderControls(); renderSummary(); renderSplit(); writeHash(); requestRender(); root.dataset.state = 'ready';
    root.dispatchEvent(new CustomEvent('outdoor:updated'));
  }

  // ------------------------------------------------------------------ источник кадра
  async function useSource(src, { keepZones = false } = {}) {
    S.source = src; if (src.kind === 'scene') S.sceneId = src.id;
    const rgba = src.photo.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, src.w, src.h).data;
    src.masks = buildZoneMasks(rgba, src.w, src.h, src.zones.map(z => ({ rings: z.rings, colorKey: z.colorKey })), { exclusion: src.exclusion || null });
    src.zones.forEach((z, i) => { z.ref = src.masks.refs[i] || [0.55, 0.55, 0.55]; z.pixels = src.masks.pixels[i]; });
    recomputeAreas();
    engine.setPhoto(src.photo, src.w, src.h); engine.setMasks({ data: src.masks.data, w: src.w, h: src.h });
    const base = keepZones ? Object.values(S.zones)[0] : null;
    if (!keepZones) { S.zones = {}; S.zoneId = src.zones[0]?.id || null; }
    else if (!src.zones.some(z => z.id === S.zoneId)) S.zoneId = src.zones[0]?.id || null;
    S.focus = src.focus || [0.5, 0.5]; S.zoom = keepZones ? S.zoom : 1; S.hover = null;
    src.zones.forEach(z => { if (!S.zones[z.id]) S.zones[z.id] = base && S.sync ? inherit(z, base) : fresh(z); });
    renderZones(); await sync();
    stage.dataset.sourceKind = src.kind;
  }
  const sceneCache = new Map();
  async function loadScene(id, { zones: preset = null, zone = null } = {}) {
    const sc = sceneById(id) || SCENES[0];
    if (!sceneCache.has(sc.id)) sceneCache.set(sc.id, loadImage(cfg.root + sc.image).then(img => drawPhoto(img, 2048)));
    say('Загружаем сцену…');
    let photo; try { photo = await sceneCache.get(sc.id); } catch (e) { say('Не удалось загрузить картинку сцены.', 'error'); return; }
    const k = photo.width / sc.width;                                   // картинка могла быть уменьшена — контуры и горизонт масштабируются
    const sH = sceneHomography({ width: photo.width, height: photo.height, camera: { ...sc.camera, horizon: sc.camera.horizon * k } });
    const src = { kind: 'scene', id: sc.id, title: sc.title, w: photo.width, h: photo.height, photo, focus: sc.focus,
      zones: sc.zones.map(z => ({ id: z.id, label: z.label, type: z.type, rings: z.rings.map(r => r.map(([x, y]) => [x * k, y * k])), H: sH, sign: 1, area: null })) };
    await useSource(src);
    if (preset) { for (const [zid, v] of Object.entries(preset)) if (src.zones.some(z => z.id === zid)) { S.zones[zid] = { ...S.zones[zid], ...Object.fromEntries(Object.entries(v).filter(([, x]) => x)) }; } if (zone) S.zoneId = zone; await sync(); }
    root.dataset.sceneId = sc.id; say('');
  }

  // ------------------------------------------------------------------ панели
  function renderZones() {
    const z = S.source?.zones || [];
    const html = z.map(x => `<button type="button" class="ol-zone" role="radio" aria-checked="${x.id === S.zoneId}" data-zone="${esc(x.id)}"><b>${esc(x.label)}</b>${ZONE_TYPES[x.type]?.label && ZONE_TYPES[x.type].label !== x.label ? `<small>${esc(ZONE_TYPES[x.type].label)}</small>` : ''}</button>`).join('');
    $('[data-zones]').innerHTML = html;
    $('[data-stage-zones]').innerHTML = z.map(x => `<button type="button" class="ol__chip" aria-pressed="${x.id === S.zoneId}" data-zone="${esc(x.id)}">${esc(x.label)}</button>`).join('');
    $('[data-sync-row]').hidden = z.length < 2;
  }
  const group = (name, items, cur, labelOf, extra = () => '') => items.map(o => `<button type="button" class="ol-chip${o.enabled ? '' : ' is-off'}" role="radio" aria-checked="${o.id === cur}" ${o.enabled ? '' : 'aria-disabled="true"'} data-pick="${name}" data-value="${esc(o.id)}" ${o.reason ? `data-reason="${esc(o.reason)}" title="${esc(o.reason)}"` : ''}>${extra(o)}<span>${labelOf(o)}</span></button>`).join('');
  function renderControls() {
    const zone = S.source.zones.find(z => z.id === S.zoneId); if (!zone) { $('[data-material-card]').innerHTML = ''; $('[data-material-strip]').innerHTML = ''; $$('[data-group]').forEach(g => { g.innerHTML = ''; }); return; }
    const cur = S.zones[zone.id], f = matOf(cur.code), st = optionStates({ zoneType: zone.type, material: f.material, settings: { format: f.format, ...cur } });
    $('[data-zone-hint]').textContent = S.source.kind === 'scene' ? 'Нажмите на поверхность в кадре — она выберется сама.' : '';
    $$('[data-zone]').forEach(b => { const on = b.dataset.zone === S.zoneId; if (b.getAttribute('role') === 'radio') b.setAttribute('aria-checked', String(on)); else b.setAttribute('aria-pressed', String(on)); });
    // материал
    $('[data-material-card]').innerHTML = `<img src="${esc(f.material.thumb)}" alt="" width="72" height="72"><div><b>${esc(f.material.name)}</b><span>X2 · ${esc(f.material.collection)}</span><small>арт. ${esc(f.variant.code)}${f.variant.priceText ? ` · ${esc(f.variant.priceText)}` : ''}</small></div>`;
    const featured = FEATURED_NAMES.map(n => M.find(m => m.name === n)).filter(Boolean);
    $('[data-material-strip]').innerHTML = featured.map(m => `<button type="button" class="ol-sw" role="radio" aria-checked="${m.key === f.material.key}" data-material="${esc(m.id)}" title="${esc(m.name)}"><img src="${esc(m.thumb)}" alt="${esc(m.name)}" width="56" height="56" loading="lazy" decoding="async"></button>`).join('');
    $('[data-group="format"]').innerHTML = group('format', st.formats, f.format, o => FORMAT_LABEL(o.id));
    $('[data-group="mount"]').innerHTML = group('mount', st.mounts, cur.mount, o => MOUNT_BY_ID[o.id].label, o => `<i class="ol-mount ol-mount--${o.id}" aria-hidden="true"></i>`);
    $('[data-mount-hint]').textContent = MOUNT_BY_ID[cur.mount].hint;
    $('[data-group="layout"]').innerHTML = group('layout', st.layouts, cur.layout, o => LAYOUT_BY_ID[o.id].label);
    $('[data-group="direction"]').innerHTML = group('direction', st.directions, cur.direction, o => DIRECTION_BY_ID[o.id].label);
    $('[data-layout-hint]').textContent = `${LAYOUT_BY_ID[cur.layout].hint} ${DIRECTION_BY_ID[cur.direction].hint}`;
    $('[data-group="joint"]').innerHTML = group('joint', st.joints, cur.joint, o => `${JOINT_BY_ID[o.id].label}<small>${esc(JOINT_BY_ID[o.id].sub)}</small>`, o => `<i class="ol-joint ol-joint--${o.id}" aria-hidden="true"></i>`);
    $('[data-sync]').checked = S.sync;
    $$('[data-compare]').forEach(b => b.setAttribute('aria-pressed', String(S.compare.mode === b.dataset.compare)));
  }

  function lineFor(zone) {
    const cur = S.zones[zone.id], f = matOf(cur.code), settings = { format: f.format, ...cur };
    const area = zone.areaOverride ?? zone.area, res = area > 0 ? packsFor(area, f.variant, { waste: wasteFraction(settings), coverage: coverage(settings) }) : null;
    return { zone, cur, f, area, res };
  }
  function renderSummary() {
    const ae = document.activeElement; if (ae && ae.matches?.('[data-area]') && root.contains(ae)) { S.summaryDirty = true; return; }      // не пересоздаём поле, пока в нём печатают
    S.summaryDirty = false;
    if (!S.source.zones.length) { $('[data-summary]').innerHTML = '<div class="ol-sum__head"><div><h2>Ваш расчёт</h2><p>Обведите поверхность на фото — и здесь появится расчёт материала.</p></div></div>'; S.lines = new Map(); return; }
    const lines = S.source.zones.map(lineFor), plot = S.source.kind === 'plot';
    const byCode = new Map();
    for (const l of lines) if (l.res) { const e = byCode.get(l.f.variant.code) || { f: l.f, packs: 0, cost: 0, area: 0 }; e.packs += l.res.packs; e.area += l.area; if (l.res.costKopecks != null) e.cost += l.res.costKopecks; byCode.set(l.f.variant.code, e); }
    const rows = lines.map(l => `<li class="ol-sum__row${l.zone.id === S.zoneId ? ' is-current' : ''}">
<button type="button" class="ol-sum__zone" data-zone="${esc(l.zone.id)}"><img src="${esc(l.f.material.thumb)}" alt="" width="44" height="44"><span><b>${esc(l.zone.label)}</b><small>${esc(l.f.material.name)} · ${FORMAT_LABEL(l.f.format)} · арт. ${esc(l.f.variant.code)}</small></span></button>
<label class="ol-sum__area"><span>${!(l.area > 0) ? 'Площадь не задана, м²' : 'Площадь, м²'}</span><input type="number" inputmode="decimal" min="0" max="5000" step="0.5" data-area="${esc(l.zone.id)}" value="${l.area ? esc(String(Math.round(l.area * 10) / 10)) : ''}" placeholder="введите"></label>
<span class="ol-sum__res">${l.res ? `<b>${number(l.res.packs, 0)} уп.</b><small>${number(Math.round(l.res.covered * 100) / 100, 2)} м²${l.res.costKopecks != null ? ` · ≈ ${money(l.res.costKopecks)}` : ''}</small>` : '<small>Укажите площадь — посчитаем упаковки</small>'}</span></li>`).join('');
    const total = [...byCode.values()].reduce((s, e) => s + e.cost, 0), packs = [...byCode.values()].reduce((s, e) => s + e.packs, 0);
    const f0 = matOf((S.zones[S.zoneId] || Object.values(S.zones)[0]).code);
    const noteScene = !plot && lines.some(l => l.zone.area != null) ? 'Площади зон на готовой сцене условные: введите площадь вашего объекта.' : plot ? (S.source.calibrated ? 'Площадь посчитана по заданному вами масштабу и приблизительна.' : 'Масштаб не задан: площадь не рассчитывается. Укажите размеры в шаге «Перспектива и масштаб» или введите площадь сами.') : '';
    $('[data-summary]').innerHTML = `<div class="ol-sum__head"><div><h2>Ваш расчёт</h2><p>${esc(noteScene)}</p></div></div>
<ul class="ol-sum__list">${rows}</ul>
<div class="ol-sum__foot">
<p class="ol-sum__total">${byCode.size ? `Итого: <b>${number(packs, 0)} уп.</b>${total ? ` · ≈ <b>${money(total)}</b>` : ''}<small>запас на подрезку учтён: 10 % (диагональ — 15 %)</small>` : '<span>Введите площадь хотя бы одной зоны, чтобы посчитать материал.</span>'}</p>
<div class="ol-sum__actions">
<button type="button" class="ol-btn ol-btn--solid" data-request ${byCode.size || true ? '' : 'disabled'}>${ICONS.cart}<span>${byCode.size ? 'В корзину и запросить расчёт' : 'Запросить расчёт'}</span></button>
<button type="button" class="ol-btn ol-btn--line" data-product="${esc(f0.variant.code)}"><span>Карточка материала</span></button>
<button type="button" class="ol-btn ol-btn--line" data-save>${ICONS.download}<span>Сохранить JPG</span></button>
<button type="button" class="ol-btn ol-btn--line" data-spec><span>Спецификация</span></button>
${plot ? '' : `<button type="button" class="ol-btn ol-btn--line" data-share>${ICONS.share}<span>Поделиться</span></button>`}
${S.projects ? '<button type="button" class="ol-btn ol-btn--solid ol-btn--project" data-project-save>Сохранить проект</button><button type="button" class="ol-btn ol-btn--line" data-project-list>Мои проекты</button>' : ''}
</div></div>`;
    S.lines = byCode;
  }

  // ------------------------------------------------------------------ сравнение, вид, ссылка
  function renderSplit() {
    const sp = $('[data-split]'), on = S.compare.mode !== 'off';
    sp.hidden = !on; if (!on) return;
    sp.style.setProperty('--x', `${S.compare.split * 100}%`);
    $('[data-split-l]').textContent = S.compare.mode === 'before' ? 'До' : 'A'; $('[data-split-r]').textContent = S.compare.mode === 'before' ? 'После' : 'B';
    if (S.compare.mode === 'ab') { const m2 = matOf(S.compare.code2); $('[data-split-r]').textContent = `B · ${m2?.material.name || ''}`; $('[data-split-l]').textContent = `A · ${matOf(S.zones[S.zoneId].code).material.name}`; }
  }
  function writeHash() {
    if (S.source?.kind !== 'scene' || !S.sceneId) return;
    try { history.replaceState(null, '', '#' + encode({ scene: S.sceneId, zone: S.zoneId, zones: S.zones })); } catch { /* адресную строку менять нельзя — не страшно */ }
  }
  function setCompare(mode) {
    if (S.compare.mode === mode) mode = 'off';
    if (mode === 'ab' && !S.compare.code2) { openMaterials('b'); return; }
    S.compare.mode = mode; sync();
  }

  // ------------------------------------------------------------------ контур зон на кадре
  function paintOverlay() {
    const g = overlay.getContext('2d'); g.clearRect(0, 0, overlay.width, overlay.height); if (!S.source) return;
    const k = overlay.width / canvas.clientWidth, line = (zone, a, w) => {
      g.save(); g.scale(1, 1); g.lineWidth = w * (window.devicePixelRatio > 1 ? 1.5 : 1); g.strokeStyle = `rgba(255,255,255,${a})`; g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 6; g.setLineDash([10, 7]);
      for (const ring of zone.rings.slice(0, 1)) { g.beginPath(); ring.forEach(([x, y], i) => { const [px, py] = fromPhoto(x, y); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.closePath(); g.stroke(); }
      g.restore();
    };
    void k;
    const t = S.flash > 0 ? S.flash : 0;
    if (S.hover) { const z = S.source.zones.find(z => z.id === S.hover); if (z) { line(z, 0.9, 2); } }
    if (t > 0) { const z = S.source.zones.find(z => z.id === S.zoneId); if (z) line(z, Math.min(1, t), 2.5); S.flash = Math.max(0, S.flash - 0.04); if (S.flash > 0) requestRender(); }
    S.view && S.drawExtra?.(g, { fromPhoto, toPhoto });
  }
  const zoneAt = (cx, cy) => {
    const [x, y] = toPhoto(cx, cy), m = S.source.masks, ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= S.source.w || iy >= S.source.h) return null;
    for (let i = S.source.zones.length - 1; i >= 0; i--) if (m.data[(iy * S.source.w + ix) * 4 + i] >= 128) return S.source.zones[i].id;
    return null;
  };
  function selectZone(id, { flash = true } = {}) { if (!id || id === S.zoneId) return; S.zoneId = id; if (flash) S.flash = 1; renderControls(); renderSummary(); requestRender(); writeHash(); }

  // ------------------------------------------------------------------ жесты на кадре
  const pointers = new Map(); let drag = null, pinch = null;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); root.dataset.touched = '1';
    if (S.source.kind === 'plot' && S.plotTool && S.plotPointer?.(e, 'down', { toPhoto, fromPhoto, count: pointers.size })) return;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: S.zoom }; drag = null; }
    else drag = { x: e.clientX, y: e.clientY, fx: S.focus[0], fy: S.focus[1], moved: false };
  });
  canvas.addEventListener('pointermove', e => {
    if (S.source?.kind === 'plot' && S.plotPointer?.(e, 'move', { toPhoto, fromPhoto, count: pointers.size })) return;
    const rect = canvas.getBoundingClientRect(); pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; S.zoom = clamp(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, 1, 4); requestRender(); return; }
    if (drag && pointers.size === 1) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (drag.moved) { const k = engine.size.w / canvas.clientWidth * S.view.scale; S.focus = [clamp(drag.fx - dx * k / S.source.w, 0, 1), clamp(drag.fy - dy * k / S.source.h, 0, 1)]; requestRender(); }
      return;
    }
    if (e.pointerType === 'mouse' && S.source) { const id = zoneAt(e.clientX - rect.left, e.clientY - rect.top); if (id !== S.hover) { S.hover = id; canvas.style.cursor = id ? 'pointer' : 'grab'; requestRender(); } }
  });
  const end = e => {
    if (S.source?.kind === 'plot' && S.plotPointer?.(e, 'up', { toPhoto, fromPhoto, count: pointers.size })) { pointers.delete(e.pointerId); if (!pointers.size) drag = null; return; }
    const was = drag; pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
    if (was && !was.moved && e.type === 'pointerup') { const rect = canvas.getBoundingClientRect(), id = zoneAt(e.clientX - rect.left, e.clientY - rect.top); if (id) selectZone(id); }
    if (!pointers.size) drag = null;
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { if (S.hover) { S.hover = null; requestRender(); } });
  canvas.addEventListener('wheel', e => { e.preventDefault(); S.zoom = clamp(S.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 1, 4); requestRender(); }, { passive: false });
  canvas.addEventListener('keydown', e => {
    const step = 0.05, map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (map[e.key]) { e.preventDefault(); S.focus = [clamp(S.focus[0] + map[e.key][0], 0, 1), clamp(S.focus[1] + map[e.key][1], 0, 1)]; requestRender(); }
    else if (e.key === '+' || e.key === '=') { S.zoom = clamp(S.zoom * 1.2, 1, 4); requestRender(); } else if (e.key === '-') { S.zoom = clamp(S.zoom / 1.2, 1, 4); requestRender(); }
  });
  new ResizeObserver(() => requestRender()).observe(stage);
  canvas.addEventListener('webglcontextrestored', () => { S.tiles.clear(); if (S.source) useSource(S.source, { keepZones: true }); });

  // разделитель сравнения
  const handle = $('[data-split-handle]');
  const moveSplit = clientX => { const r = stage.getBoundingClientRect(); S.compare.split = clamp((clientX - r.left) / r.width, 0.05, 0.95); engine.setCompare(S.compare.mode, S.compare.split); renderSplit(); requestRender(); };
  handle.addEventListener('pointerdown', e => { handle.setPointerCapture(e.pointerId); handle.dataset.drag = '1'; e.stopPropagation(); });
  handle.addEventListener('pointermove', e => { if (handle.dataset.drag) moveSplit(e.clientX); });
  handle.addEventListener('pointerup', () => { delete handle.dataset.drag; });
  handle.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); S.compare.split = clamp(S.compare.split + (e.key === 'ArrowRight' ? 0.03 : -0.03), 0.05, 0.95); engine.setCompare(S.compare.mode, S.compare.split); renderSplit(); requestRender(); } });

  // ------------------------------------------------------------------ список материалов
  const dlg = $('[data-materials-dialog]'); let coll = 'all';
  function openMaterials(forWhat = 'a') {
    coll = 'all'; $('[data-material-search]').value = '';
    S.pick = forWhat; $('#ol-mat-title').textContent = forWhat === 'b' ? 'Материал для сравнения (B)' : 'Материалы X2 для улицы';
    const colls = [...new Map(M.map(m => [m.collectionId, m.collection])).entries()];
    $('[data-collections]').innerHTML = `<button type="button" class="ol-chip" role="radio" aria-checked="${coll === 'all'}" data-coll="all">Все (${M.length})</button>` + colls.map(([id, name]) => `<button type="button" class="ol-chip" role="radio" aria-checked="${coll === id}" data-coll="${esc(id)}">${esc(name)}</button>`).join('');
    renderGrid(); dlg.showModal(); $('[data-material-search]').focus();
  }
  function renderGrid() {
    const q = normalize($('[data-material-search]').value || ''), toks = q.split(' ').filter(Boolean), cur = matOf(S.zones[S.zoneId]?.code || DEFAULT_CODE)?.material.key;
    const list = M.filter(m => (coll === 'all' || m.collectionId === coll) && toks.every(t => normalize(`${m.name} ${m.collection} ${m.formats.map(f => m.variants[f].code).join(' ')}`).includes(t)));
    $('[data-material-grid]').innerHTML = list.map(m => `<button type="button" class="ol-card" data-material="${esc(m.id)}" aria-pressed="${m.key === cur}"><img src="${esc(m.thumb)}" alt="" width="160" height="160" loading="lazy" decoding="async"><b>${esc(m.name)}</b><small>${m.formats.map(FORMAT_LABEL).join(' · ')}</small></button>`).join('');
    $('[data-material-empty]').hidden = list.length > 0;
  }
  $('[data-material-search]').addEventListener('input', renderGrid);
  dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-dialog-close]')) dlg.close(); });
  $('[data-open-materials]').addEventListener('click', () => openMaterials('a'));

  // ------------------------------------------------------------------ сохранение и действия
  async function snapshotBlob({ maxSide = 2400, quality = 0.92 } = {}) {
    const c = engine.snapshot({ maxSide }), g = c.getContext('2d'), h = Math.max(36, Math.round(c.height * 0.055));
    const grd = g.createLinearGradient(0, c.height - h * 1.6, 0, c.height); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = grd; g.fillRect(0, c.height - h * 1.6, c.width, h * 1.6);
    g.fillStyle = '#fff'; g.font = `600 ${Math.round(h * 0.42)}px Inter, Arial, sans-serif`; g.textBaseline = 'middle';
    const zone = matOf(S.zones[S.zoneId].code); g.fillText(`ITALON X2 · Outdoor Lab · ${zone.material.name}, ${FORMAT_LABEL(zone.format)} · italon-x2.ru`, h * 0.5, c.height - h * 0.55);
    return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', quality));
  }
  async function save() {
    say('Готовим изображение…'); const blob = await snapshotBlob(); if (!blob) { say('Не получилось сохранить изображение. Попробуйте ещё раз.', 'error'); return; }
    const name = `italon-x2-outdoor-${S.source.id}.jpg`, file = new File([blob], name, { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) { try { await navigator.share({ files: [file], title: 'Italon X2 — Outdoor Lab' }); say(''); return; } catch (e) { if (e.name === 'AbortError') { say(''); return; } } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); say('Изображение сохранено.');
    root.dispatchEvent(new CustomEvent('outdoor:saved', { detail: { size: blob.size } }));
  }
  async function share() {
    const url = location.href;
    if (navigator.share && /iPhone|iPad|Android/i.test(navigator.userAgent)) { try { await navigator.share({ title: 'Italon X2 — Outdoor Lab', url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); } catch { window.prompt('Скопируйте ссылку', url); }
  }
  function specText() {
    const lines = S.source.zones.map(lineFor), d = new Date().toLocaleDateString('ru-RU');
    const out = [`ITALON X2 · Outdoor Lab · спецификация визуализации (${d})`, `Источник: ${S.source.kind === 'scene' ? `готовая сцена «${S.source.title}»` : 'фото посетителя'}`, ''];
    lines.forEach((l, i) => {
      const cur = S.zones[l.zone.id], st = { format: l.f.format, ...cur };
      out.push(`${i + 1}. ${l.zone.label}${ZONE_TYPES[l.zone.type]?.label && ZONE_TYPES[l.zone.type].label !== l.zone.label ? ` (${ZONE_TYPES[l.zone.type].label})` : ''}`, `   Материал: ${l.f.material.name}, X2, арт. ${l.f.variant.code}`, `   Формат: ${FORMAT_LABEL(l.f.format).replace(/\u00a0/g, ' ')}${l.f.variant.priceText ? `, цена ${l.f.variant.priceText}` : ''}`,
        `   Укладка: ${MOUNT_BY_ID[cur.mount].label.toLowerCase()}, раскладка «${LAYOUT_BY_ID[cur.layout].label.toLowerCase()}», направление «${DIRECTION_BY_ID[cur.direction].label.toLowerCase()}», шов: ${JOINT_BY_ID[cur.joint].label.toLowerCase()} (${JOINT_BY_ID[cur.joint].sub})`,
        l.area ? `   Площадь: ${number(l.area, 1)} м² (${S.source.kind === 'scene' ? 'введена или условная для сцены' : 'по заданному масштабу, приблизительно'}); упаковок: ${l.res ? l.res.packs : '—'}${l.res?.costKopecks != null ? `; ≈ ${money(l.res.costKopecks)}` : ''}` : '   Площадь: не измерена, количество и стоимость не рассчитаны', '');
      void st;
    });
    out.push('Оговорка: визуализация приблизительна. Цвет зависит от экрана и освещения, масштаб — от точности ваших исходных размеров. Это не проект и не инженерный расчёт; точное количество и стоимость уточняются при расчёте в салоне Italon Experience или у менеджера.', 'italon-x2.ru');
    return out.join('\r\n');
  }
  function saveSpec() { const blob = new Blob(['\ufeff' + specText()], { type: 'text/plain;charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `italon-x2-spec-${S.source.id}.txt`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); say('Спецификация сохранена.'); }
  async function request() {
    const cart = window.Italon?.cart;
    if (!cart) { say('Корзина доступна на сайте italon-x2.ru.', 'error'); return; }
    if (!S.lines?.size) { cart.open(); toast('Введите площадь зоны, чтобы мы положили в корзину нужное количество.'); return; }
    for (const [code, e] of S.lines) await cart.add(code, e.packs);
    cart.open();
  }

  // ------------------------------------------------------------------ события панели
  root.addEventListener('click', e => {
    const t = e.target;
    const pick = t.closest('[data-pick]');
    if (pick) { if (pick.getAttribute('aria-disabled') === 'true') { say(pick.dataset.reason || 'Это сочетание недоступно.', 'warn'); return; } const v = pick.dataset.value; change({ [pick.dataset.pick]: v }); return; }
    const mat = t.closest('[data-material]');
    if (mat) { const m = M.find(x => x.id === mat.dataset.material); if (!m) return; if (S.pick === 'b' && dlg.open) { const f = matOf(S.zones[S.zoneId].code); S.compare.code2 = variantOf(m, m.formats.includes(f.format) ? f.format : m.formats[0]).code; S.compare.mode = 'ab'; S.pick = null; dlg.close(); sync(); return; } setMaterial(m); if (dlg.open) dlg.close(); return; }
    const coll_ = t.closest('[data-coll]'); if (coll_) { coll = coll_.dataset.coll; $$('[data-coll]').forEach(b => b.setAttribute('aria-checked', String(b === coll_))); renderGrid(); return; }
    const zn = t.closest('[data-zone]'); if (zn) { selectZone(zn.dataset.zone); return; }
    const sc = t.closest('[data-scene]'); if (sc && (sc.dataset.scene !== S.sceneId || root.dataset.mode === 'plot')) {
      if (root.dataset.mode === 'plot') { S.sceneId = sc.dataset.scene; S.onMode?.('scene'); return; } S.compare = { mode: 'off', split: 0.5, code2: S.compare.code2 }; loadScene(sc.dataset.scene).then(() => { if (sc.closest('.ol-more')) stage.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); return; }
    const cmp = t.closest('[data-compare]'); if (cmp) { setCompare(cmp.dataset.compare); return; }
    const zm = t.closest('[data-zoom]'); if (zm) { S.zoom = clamp(S.zoom * (Number(zm.dataset.zoom) > 0 ? 1.3 : 1 / 1.3), 1, 4); requestRender(); return; }
    if (t.closest('[data-fullscreen]')) { const on = stage.classList.toggle('is-full'); document.body.classList.toggle('ol-lock', on); stage.querySelector('[data-fullscreen]').setAttribute('aria-pressed', String(on)); requestRender(); return; }
    if (t.closest('[data-save]')) { save(); return; }
    if (t.closest('[data-spec]')) { saveSpec(); return; }
    if (t.closest('[data-share]')) { share(); return; }
    if (t.closest('[data-request]')) { request(); return; }
    const modeTab = t.closest('[data-mode-tab]'); if (modeTab) { S.onMode?.(modeTab.dataset.modeTab); return; }
  });
  root.addEventListener('change', e => {
    if (e.target.matches('[data-sync]')) { S.sync = e.target.checked; if (S.sync) change({ ...S.zones[S.zoneId] }); return; }
    const a = e.target.closest('[data-area]'); if (a) { const z = S.source.zones.find(z => z.id === a.dataset.area), v = Number(String(a.value).replace(',', '.')); if (z) { z.areaOverride = Number.isFinite(v) && v > 0 && v <= 5000 ? v : (a.value === '' ? 0 : z.areaOverride); if (a.value !== '' && !(v > 0 && v <= 5000)) say('Площадь — число от 0 до 5000 м².', 'warn'); a.blur(); renderSummary(); } }
  });
  root.addEventListener('focusout', e => { if (e.target.matches?.('[data-area]') && S.summaryDirty) setTimeout(() => renderSummary(), 0); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && stage.classList.contains('is-full')) { stage.classList.remove('is-full'); document.body.classList.remove('ol-lock'); requestRender(); } });

  // ------------------------------------------------------------------ запуск
  const api = { state: S, recomputeAreas, specText, engine, matOf, M, change, sync, useSource, loadScene, requestRender, say, toast, selectZone, renderControls, renderSummary, renderZones, loadImage, drawPhoto, snapshotBlob, save, openMaterials, zoneAt, tileFor, fromPhoto, toPhoto };
  root.outdoor = api;
  // laying examples
  $('[data-laying]').innerHTML = (cfg.laying || []).map(l => `<button type="button" class="ol-lay__card" data-laying="${esc(l.id)}">${l.image ? `<img src="${esc(cfg.root + l.image.src.replace(/^\//, ''))}" alt="" width="${l.image.width}" height="${l.image.height}" loading="lazy" decoding="async">` : ''}<b>${esc(l.label)}</b><small>${esc(l.caption)}</small></button>`).join('');
  const fromUrl = decode(location.hash, { scenes: SCENES, hasCode: c => !!matOf(c) });
  const first = fromUrl.scene || SCENES[0].id;
  await loadScene(first, { zones: Object.keys(fromUrl.zones).length ? fromUrl.zones : null, zone: fromUrl.zone || null });
  root.addEventListener('outdoor:updated', () => $$('[data-scenes] [data-scene]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scene === S.sceneId))));
  api.plot = initPlot(api, root);
  api.projects = initProjects(api, root, cfg);
  root.dispatchEvent(new CustomEvent('outdoor:updated'));
  return api;
}
