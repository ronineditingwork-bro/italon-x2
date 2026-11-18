// X2 Outdoor Lab: «Мой участок». Посетитель загружает своё фото, обводит поверхности точками, исключает лишнее, задаёт перспективу и масштаб — и примеряет плитку X2.
// Фото обрабатывается только в браузере (Canvas/WebGL) и никуда не отправляется. Перспектива — гомография: по четырём углам с размерами или по горизонту/повороту/высоте камеры.
import { quadHomography, cameraHomography, calibrateByDistance, worldDistance, isConvexQuad, apply } from './geometry.mjs';
import { ZONE_TYPES } from './options.mjs';
import { esc } from '../format.mjs';
import { ICONS } from './ui.mjs';

const MAX_FILE = 30 * 1024 * 1024, MAX_PIXELS = 100e6, MAX_SURFACES = 4;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const TYPES = [['terrace', 'Терраса'], ['path', 'Дорожка'], ['pool', 'У бассейна'], ['patio', 'Патио']];
const FOVS = [[75, 'Широкоугольный (0,5×)'], [62, 'Обычный (телефон)'], [45, 'Телеобъектив (2×)']];
const DRAFT_DB = 'italon-x2-outdoor', DRAFT_KEY = 'draft-v1';

export function validatePhotoFile(file) {
  if (!file) return 'Файл не выбран.';
  if (file.size > MAX_FILE) return 'Файл больше 30 МБ. Выберите фото поменьше или сожмите его.';
  if (file.type && !/^image\/(jpeg|png|webp|heic|heif|avif)$/i.test(file.type)) return 'Этот формат не поддерживается. Выберите фото JPG, PNG или WebP.';
  return '';
}
export const tooBig = (w, h) => !(w > 0 && h > 0) || w * h > MAX_PIXELS;

export function initPlot(app, root) {
  const S = app.state, engine = app.engine, $ = (s, r = root) => r.querySelector(s), $$ = (s, r = root) => [...r.querySelectorAll(s)];
  const pane = $('[data-plot-pane]'), stage = $('[data-stage]'), canvas = $('[data-canvas]');
  const P = { on: false, photo: null, w: 0, h: 0, rgba: null, surfaces: [], cur: 0, tool: 'contour', excl: null, exclCtx: null, brush: 26, key: true, drag: null, sel: null, undo: [], step: 'outline', calib: null, painting: false, lastTap: 0, seq: 0 };
  const mobile = matchMedia('(max-width: 820px)').matches;

  pane.innerHTML = `
<section class="ol-step"><h2 class="ol-step__title"><span class="ol-step__n" aria-hidden="true">1</span>Ваше фото</h2>
<div class="ol-row"><label class="ol-btn ol-btn--solid ol-file">${ICONS.image}<span>Выбрать фото</span><input type="file" accept="image/*" hidden data-plot-file></label><label class="ol-btn ol-btn--line ol-file">${ICONS.camera}<span>Снять камерой</span><input type="file" accept="image/*" capture="environment" hidden data-plot-camera></label></div>
<p class="ol-hint">Фото обрабатывается на вашем устройстве и никуда не отправляется. Лучше снимать участок немного сверху, чтобы поверхность была видна целиком.</p>
<div data-draft></div></section>
<section class="ol-step" data-plot-step="surfaces"><h2 class="ol-step__title"><span class="ol-step__n" aria-hidden="true">2</span>Обведите поверхность</h2>
<div class="ol-surfaces" data-surfaces></div>
<div class="ol-row"><button type="button" class="ol-btn ol-btn--line" data-plot-add>${ICONS.plus}<span>Ещё поверхность</span></button><button type="button" class="ol-btn ol-btn--line" data-plot-del>Удалить</button></div>
<div class="ol-chips" data-plot-tools role="radiogroup" aria-label="Инструмент">
<button type="button" class="ol-chip" role="radio" data-tool="contour" aria-checked="true">Контур</button>
<button type="button" class="ol-chip" role="radio" data-tool="hole" aria-checked="false">Вырезать область</button>
<button type="button" class="ol-chip" role="radio" data-tool="brush" aria-checked="false">Кисть-исключение</button>
<button type="button" class="ol-chip" role="radio" data-tool="eraser" aria-checked="false">Ластик</button></div>
<label class="ol-range" data-brush-row hidden><span>Размер кисти</span><input type="range" min="8" max="90" value="26" data-brush></label>
<div class="ol-row"><button type="button" class="ol-btn ol-btn--line" data-plot-undo>${ICONS.undo}<span>Отменить</span></button><button type="button" class="ol-btn ol-btn--line" data-plot-point-del>Удалить точку</button><button type="button" class="ol-btn ol-btn--line" data-plot-close>Замкнуть</button><button type="button" class="ol-btn ol-btn--line" data-plot-clear>Очистить</button></div>
<p class="ol-hint" data-plot-hint></p>
<label class="ol-sync"><input type="checkbox" data-plot-key checked><span>Уточнять край по цвету (убирает траву, мебель, воду)</span></label></section>
<section class="ol-step" data-plot-step="persp"><h2 class="ol-step__title"><span class="ol-step__n" aria-hidden="true">3</span>Перспектива и масштаб</h2>
<div class="ol-modes ol-modes--small" role="tablist" aria-label="Способ задать перспективу"><button type="button" role="tab" aria-selected="true" data-pmode="quad">По четырём углам</button><button type="button" role="tab" aria-selected="false" data-pmode="horizon">По горизонту</button></div>
<div data-persp></div></section>
<section class="ol-step"><h2 class="ol-step__title"><span class="ol-step__n" aria-hidden="true">·</span>Яркость плитки</h2><label class="ol-range"><span>Подстройка под освещение вашего фото</span><input type="range" min="60" max="150" value="100" data-exposure></label></section>`;
  const hint = $('[data-plot-hint]'), surfEl = $('[data-surfaces]'), perspEl = $('[data-persp]');

  // ------------------------------------------------------------------ поверхности
  const cur = () => P.surfaces[P.cur] || null;
  const newSurface = (n) => ({ id: `s${++P.seq}`, label: `Поверхность ${n}`, type: 'terrace', ring: [], closed: false, holes: [], hole: [], mode: 'quad', quad: null, dims: { w: 4, l: 6, touched: false }, horizon: { y: 0.38, yaw: 0, height: 1.6, fov: 62, touched: false }, known: null });
  function snapshot() { P.undo.push({ s: JSON.parse(JSON.stringify(P.surfaces)), cur: P.cur, e: P.excl ? P.exclCtx.getImageData(0, 0, P.excl.width, P.excl.height) : null }); if (P.undo.length > 12) P.undo.shift(); }
  function undo() {
    const u = P.undo.pop(); if (!u) { app.say('Отменять нечего.'); return; }
    P.surfaces = u.s; P.cur = Math.min(u.cur, P.surfaces.length - 1); if (u.e && P.excl) P.exclCtx.putImageData(u.e, 0, 0);
    renderPane(); rebuild();
  }
  const surfaceH = s => {
    if (s.mode === 'quad' && s.quad && isConvexQuad(s.quad)) { const H = quadHomography(s.quad, s.dims.w, s.dims.l); if (H) { let H2 = H; if (s.known) H2 = calibrateByDistance(H, s.known.a, s.known.b, s.known.m) || H; return { H: H2, calibrated: s.dims.touched || !!s.known }; } }
    const hz = s.horizon; let H = cameraHomography({ width: P.w, height: P.h, horizon: hz.y * P.h, yawDeg: hz.yaw, fovDeg: hz.fov, heightM: hz.height });
    if (s.known) H = calibrateByDistance(H, s.known.a, s.known.b, s.known.m) || H;
    return { H, calibrated: hz.touched || !!s.known };
  };
  const signOf = (H, ring) => { let cx = 0, cy = 0; for (const [x, y] of ring) { cx += x; cy += y; } cx /= ring.length; cy /= ring.length; const w = H[6] * cx + H[7] * cy + H[8]; return w < 0 ? -1 : 1; };
  const quadFromRing = s => { const r = s.ring; if (r.length === 4 && isConvexQuad(r)) { const c = r.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]); const far = r.map(p => p).sort((a, b) => a[1] - b[1]); const top = far.slice(0, 2).sort((a, b) => a[0] - b[0]), bot = far.slice(2).sort((a, b) => b[0] - a[0]); void c; return [top[0], top[1], bot[0], bot[1]].map(p => [...p]); } return null; };
  function ensureQuad(s) {
    if (s.quad) return;
    const q = quadFromRing(s);
    if (q) { s.quad = q; return; }
    const xs = s.ring.map(p => p[0]), ys = s.ring.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), w = x1 - x0, inset = w * 0.18;
    s.quad = [[x0 + inset, y0], [x1 - inset, y0], [x1, y1], [x0, y1]];
  }

  // ------------------------------------------------------------------ сборка источника
  let timer = 0; const rebuild = () => { clearTimeout(timer); timer = setTimeout(doRebuild, 90); };
  function exclusionArray() {
    if (!P.excl) return null; const c = document.createElement('canvas'); c.width = P.w; c.height = P.h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(P.excl, 0, 0, P.w, P.h);
    const d = g.getImageData(0, 0, P.w, P.h).data, out = new Uint8Array(P.w * P.h); let any = 0; for (let i = 0; i < out.length; i++) { out[i] = d[i * 4 + 3]; any |= out[i]; } return any ? out : null;
  }
  async function doRebuild() {
    if (!P.on || !P.photo) return;
    const zones = []; P.surfaces.forEach((s, i) => { if (s.closed && s.ring.length >= 3 && zones.length < 4) { const { H, calibrated } = surfaceH(s); zones.push({ id: s.id, label: s.label, type: s.type, rings: [s.ring, ...s.holes], H, sign: signOf(H, s.ring), calibrated, colorKey: P.key, gridMode: P.step === 'persp' && i === P.cur, area: null }); } });
    const src = { kind: 'plot', id: 'plot', title: 'Мой участок', w: P.w, h: P.h, photo: P.photo, focus: S.focus, zones, exclusion: exclusionArray(), calibrated: zones.length > 0 && zones.every(z => z.calibrated) };
    const keepFocus = S.focus, keepZoom = S.zoom;
    await app.useSource(src, { keepZones: true });
    S.focus = keepFocus; S.zoom = keepZoom; if (zones.length && !zones.some(z => z.id === S.zoneId)) S.zoneId = zones[0].id;
    const s = cur(); if (s && zones.some(z => z.id === s.id)) S.zoneId = s.id;
    app.requestRender(); renderPane();
  }
  function refreshH() {
    if (!S.source || S.source.kind !== 'plot') return;
    S.source.zones.forEach((z, i) => { const s = P.surfaces.find(x => x.id === z.id); if (!s) return; const r = surfaceH(s); z.H = r.H; z.sign = signOf(r.H, s.ring); z.calibrated = r.calibrated; z.gridMode = P.step === 'persp' && s === cur(); z.areaOverride = z.areaOverride; });
    S.source.calibrated = S.source.zones.length > 0 && S.source.zones.every(z => z.calibrated);
    app.recomputeAreas(); app.sync();
  }

  // ------------------------------------------------------------------ загрузка фото
  async function openFile(file) {
    const bad = validatePhotoFile(file); if (bad) { app.say(bad, 'error'); return; }
    app.say('Открываем фото…');
    const url = URL.createObjectURL(file);
    try {
      const img = await app.loadImage(url); if (img.decode) await img.decode().catch(() => {});
      if (tooBig(img.naturalWidth, img.naturalHeight)) throw new Error('Фото слишком большое или повреждено.');
      if (Math.min(img.naturalWidth, img.naturalHeight) < 240) throw new Error('Фото слишком маленькое: нужно хотя бы 240 пикселей по короткой стороне.');
      startWith(app.drawPhoto(img, mobile ? 1600 : 2048));
    } catch (e) { app.say(e.message?.startsWith('Фото') ? e.message : 'Не удалось открыть файл. Выберите фото JPG, PNG или WebP.', 'error'); }
    finally { URL.revokeObjectURL(url); }
  }
  function startWith(photo, saved = null) {
    P.photo = photo; P.w = photo.width; P.h = photo.height;
    P.excl = document.createElement('canvas'); P.excl.width = Math.min(photo.width, 1024); P.excl.height = Math.round(P.excl.width * photo.height / photo.width); P.exclCtx = P.excl.getContext('2d', { willReadFrequently: true });
    P.surfaces = saved?.surfaces || [newSurface(1)]; P.cur = 0; P.undo = []; P.tool = 'contour'; P.step = 'outline'; P.seq = Math.max(P.seq, ...P.surfaces.map(s => Number(String(s.id).slice(1)) || 0));
    if (saved?.excl) { const im = new Image(); im.onload = () => { P.exclCtx.drawImage(im, 0, 0, P.excl.width, P.excl.height); rebuild(); }; im.src = saved.excl; }
    S.zones = {}; setMode('plot', true); say0(); renderDraft();
  }
  const say0 = () => app.say('Нажимайте на фото, чтобы поставить точки по краю поверхности. Замкните контур, нажав на первую точку.');

  // ------------------------------------------------------------------ режимы страницы
  function setMode(mode, force = false) {
    if (mode === (P.on ? 'plot' : 'scene') && !force) return;
    $$('[data-mode-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.modeTab === mode)));
    root.dataset.mode = mode; $('[data-pane="scene"]').hidden = mode !== 'scene'; pane.hidden = mode !== 'plot';
    root.querySelector('.ol__title')?.toggleAttribute('hidden', mode === 'plot' && !!P.photo);
    if (mode === 'plot') {
      P.on = true; S.plotTool = true; S.plotPointer = onPointer; S.drawExtra = drawExtra;
      if (!P.photo) { showEmpty(true); } else { showEmpty(false); doRebuild(); }
    } else {
      P.on = false; S.plotTool = false; S.plotPointer = null; S.drawExtra = null; showEmpty(false);
      app.loadScene(S.sceneId || undefined).then(() => app.requestRender());
    }
    renumber(); renderPane();
  }
  S.onMode = m => setMode(m);
  function renumber() { let n = 0; $$('.ol-step').forEach(st => { if (st.closest('[hidden]') || st.hidden) return; const el = st.querySelector('.ol-step__n'); if (el && el.textContent !== '·') el.textContent = String(++n); }); }
  let empty = null;
  function showEmpty(on) {
    if (!empty) { empty = document.createElement('div'); empty.className = 'ol-empty'; empty.innerHTML = `<div class="ol-empty__box"><h2>Примерьте плитку на фото вашего участка</h2><p>Загрузите снимок дома, дорожки или террасы, обведите поверхность — и увидите настоящий керамогранит X2 в перспективе. Фото не покидает ваше устройство.</p><div class="ol-row"><label class="ol-btn ol-btn--solid ol-file">${ICONS.image}<span>Выбрать фото</span><input type="file" accept="image/*" hidden data-plot-file></label><label class="ol-btn ol-btn--line ol-file">${ICONS.camera}<span>Снять камерой</span><input type="file" accept="image/*" capture="environment" hidden data-plot-camera></label></div></div>`; stage.appendChild(empty); }
    empty.hidden = !on;
  }
  stage.addEventListener('dragover', e => { if (P.on) e.preventDefault(); });
  stage.addEventListener('drop', e => { if (!P.on) return; e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) openFile(f); });
  root.addEventListener('change', e => { const f = e.target.closest?.('[data-plot-file],[data-plot-camera]'); if (f) { const file = f.files?.[0]; f.value = ''; if (file) openFile(file); } });

  // ------------------------------------------------------------------ панель
  function renderPane() {
    if (!P.on) return;
    const s = cur();
    surfEl.innerHTML = P.surfaces.map((x, i) => `<div class="ol-surf${i === P.cur ? ' is-current' : ''}"><button type="button" class="ol-surf__pick" data-psurf="${i}" aria-pressed="${i === P.cur}"><b>${esc(x.label)}</b><small>${x.closed ? 'контур готов' : x.ring.length ? `точек: ${x.ring.length}` : 'не обведена'}</small></button>
<select class="ol-select" data-ptype="${i}" aria-label="Тип поверхности">${TYPES.map(([id, l]) => `<option value="${id}"${x.type === id ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`).join('');
    $('[data-plot-add]').disabled = P.surfaces.length >= MAX_SURFACES; $('[data-plot-del]').disabled = !s;
    $$('[data-tool]', pane).forEach(b => b.setAttribute('aria-checked', String(b.dataset.tool === P.tool)));
    $('[data-brush-row]').hidden = !(P.tool === 'brush' || P.tool === 'eraser');
    hint.textContent = P.tool === 'contour' ? (s?.closed ? 'Контур готов. Перетаскивайте точки, чтобы уточнить; двойное касание по точке удаляет её. Колесо мыши или щипок — масштаб.' : `Нажимайте на фото по краю поверхности. Замкните контур нажатием на первую точку или кнопкой «Замкнуть».${mobile ? ' Для точной разметки приблизьте фото двумя пальцами.' : ''}`)
      : P.tool === 'hole' ? 'Обведите то, что стоит на поверхности (ступени, мебель, горшки, людей): эта область не закрасится плиткой.' : 'Закрашивайте пальцем или мышью то, что не должно покрыться плиткой. Ластик возвращает область.';
    $$('[data-pmode]', pane).forEach(b => b.setAttribute('aria-selected', String(s && s.mode === b.dataset.pmode)));
    renderPersp(s);
    $('[data-plot-key]').checked = P.key; $('[data-exposure]').value = String(Math.round(S.exposure * 100));
    renumber();
  }
  function renderPersp(s) {
    if (!s) { perspEl.innerHTML = '<p class="ol-hint">Сначала обведите поверхность.</p>'; return; }
    if (!s.closed) { perspEl.innerHTML = '<p class="ol-hint">Замкните контур поверхности — тогда можно настроить перспективу.</p>'; return; }
    const known = s.known ? `<p class="ol-hint ol-hint--ok">Масштаб задан по известному размеру: ${s.known.m} м.</p>` : '';
    if (s.mode === 'quad') {
      ensureQuad(s);
      perspEl.innerHTML = `<p class="ol-hint">Передвиньте четыре угла на углы прямоугольного участка на земле (или на стене) и введите его реальные размеры. Порядок: 1 — дальний левый, 2 — дальний правый, 3 — ближний правый, 4 — ближний левый.</p>
<div class="ol-fields"><label class="ol-field"><span>Сторона 1–2, м</span><input type="number" inputmode="decimal" min="0.3" max="200" step="0.1" value="${s.dims.w}" data-dim="w"></label><label class="ol-field"><span>Сторона 2–3, м</span><input type="number" inputmode="decimal" min="0.3" max="200" step="0.1" value="${s.dims.l}" data-dim="l"></label></div>
<div class="ol-row"><button type="button" class="ol-btn ol-btn--line" data-quad-from>Взять углы из контура</button><button type="button" class="ol-btn ol-btn--line" data-quad-reset>Сбросить</button></div>
<p class="ol-hint">${s.dims.touched ? 'Размеры заданы вами: площадь считается по ним.' : 'Размеры по умолчанию условные: пока вы их не введёте, площадь не рассчитывается.'}</p>${known}`;
    } else {
      const h = s.horizon;
      perspEl.innerHTML = `<p class="ol-hint">Подберите так, чтобы жёлтая сетка 1 × 1 м шла вдоль краёв поверхности. Перетащите линию горизонта на фото или двигайте ползунки.</p>
<label class="ol-range"><span>Горизонт</span><input type="range" min="-60" max="95" value="${Math.round(h.y * 100)}" data-hz="y"></label>
<label class="ol-range"><span>Поворот</span><input type="range" min="-75" max="75" value="${h.yaw}" data-hz="yaw"></label>
<label class="ol-range"><span>Высота камеры, м</span><input type="range" min="0.4" max="12" step="0.1" value="${h.height}" data-hz="height"><output>${h.height}</output></label>
<label class="ol-field"><span>Объектив</span><select class="ol-select" data-hz="fov">${FOVS.map(([v, l]) => `<option value="${v}"${h.fov === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
<div class="ol-row"><button type="button" class="ol-btn ol-btn--line" data-known-start>Задать масштаб по известному размеру</button></div>
<p class="ol-hint">${h.touched || s.known ? 'Масштаб задан вами: площадь считается приблизительно.' : 'Пока масштаб не подтверждён, площадь не рассчитывается: отметьте на фото два места с известным расстоянием (например, ширина двери 0,9 м).'}</p>${known}`;
    }
  }

  // ------------------------------------------------------------------ жесты на кадре
  const pxToPhoto = css => css * (engine.size.w / canvas.clientWidth) * S.view.scale;
  const hitR = () => pxToPhoto(mobile ? 22 : 14);
  function allRings(s) { const r = []; if (s.ring.length) r.push({ kind: 'ring', pts: s.ring }); s.holes.forEach((h, i) => r.push({ kind: 'hole', pts: h, i })); if (s.hole.length) r.push({ kind: 'draft', pts: s.hole }); return r; }
  function nearestPoint(s, p) {
    let best = null, bd = hitR();
    for (const r of allRings(s)) r.pts.forEach((q, i) => { const d = dist(p, q); if (d < bd) { bd = d; best = { r, i }; } });
    return best;
  }
  function paintExclusion(p, erase) {
    const g = P.exclCtx, k = P.excl.width / P.w, r = Math.max(2, pxToPhoto(P.brush / 2)) * k;
    g.save(); g.globalCompositeOperation = erase ? 'destination-out' : 'source-over'; g.fillStyle = 'rgba(255,0,0,1)'; g.beginPath(); g.arc(p[0] * k, p[1] * k, r, 0, Math.PI * 2); g.fill();
    if (P.last) { g.lineWidth = r * 2; g.lineCap = 'round'; g.strokeStyle = 'rgba(255,0,0,1)'; g.beginPath(); g.moveTo(P.last[0] * k, P.last[1] * k); g.lineTo(p[0] * k, p[1] * k); g.stroke(); }
    g.restore(); P.last = p;
  }
  function onPointer(e, phase, ctx) {
    const { toPhoto } = ctx;
    if (!P.on || !P.photo) return false;
    if (ctx.count > 1) { P.drag = null; P.painting = false; return false; }          // два пальца — масштаб и сдвиг, а не рисование
    const rect = canvas.getBoundingClientRect(), p = toPhoto(e.clientX - rect.left, e.clientY - rect.top), s = cur();
    // горизонт и углы четырёхугольника — на шаге «Перспектива»
    if (P.step === 'persp' && s?.closed) {
      if (phase === 'down') {
        if (P.calib) { P.calib.pts.push(p); if (P.calib.pts.length === 2) finishKnown(); app.requestRender(); return true; }
        if (s.mode === 'quad' && s.quad) { let bi = -1, bd = hitR(); s.quad.forEach((q, i) => { const d = dist(p, q); if (d < bd) { bd = d; bi = i; } }); if (bi >= 0) { P.drag = { quad: bi }; snapshot(); return true; } }
        if (s.mode === 'horizon') { const hy = s.horizon.y * P.h; if (Math.abs(p[1] - hy) < hitR() * 1.4) { P.drag = { horizon: true }; snapshot(); return true; } }
        return false;
      }
      if (phase === 'move' && P.drag) { if (P.drag.quad != null) { s.quad[P.drag.quad] = [clamp(p[0], 0, P.w), clamp(p[1], 0, P.h)]; } else if (P.drag.horizon) { s.horizon.y = clamp(p[1] / P.h, -0.6, 0.95); s.horizon.touched = false; } refreshH(); if (P.drag.horizon) renderPersp(s); return true; }
      if (phase === 'up' && P.drag) { P.drag = null; renderPersp(s); return true; }
      return false;
    }
    if (!s) return false;
    if (P.tool === 'brush' || P.tool === 'eraser') {
      if (phase === 'down') { snapshot(); P.painting = true; P.last = null; paintExclusion(p, P.tool === 'eraser'); app.requestRender(); return true; }
      if (phase === 'move' && P.painting) { paintExclusion(p, P.tool === 'eraser'); app.requestRender(); return true; }
      if (phase === 'up' && P.painting) { P.painting = false; P.last = null; rebuild(); return true; }
      return false;
    }
    const hole = P.tool === 'hole', ring = hole ? s.hole : s.ring;
    if (phase === 'down') {
      if (ring.length >= 3 && dist(p, ring[0]) < hitR() && (hole || !s.closed)) { closeRing(); return true; }       // нажатие на первую точку замыкает контур
      const hit = nearestPoint(s, p), now = performance.now();
      if (hit) {
        if (now - P.lastTap < 350 && P.sel && P.sel.r.pts === hit.r.pts && P.sel.i === hit.i) { deletePoint(hit); P.lastTap = 0; return true; }
        P.lastTap = now; P.sel = hit; snapshot(); P.drag = { hit }; app.requestRender(); return true;
      }
      if (!hole && s.closed) return false;
      if (!hole || s.closed) {
        if (ring.length >= 3 && dist(p, ring[0]) < hitR()) { closeRing(); return true; }
        if (!s.closed || hole) { snapshot(); ring.push([clamp(p[0], 0, P.w), clamp(p[1], 0, P.h)]); P.sel = { r: { kind: hole ? 'draft' : 'ring', pts: ring }, i: ring.length - 1 }; P.drag = { hit: P.sel }; P.lastTap = performance.now(); renderPane(); app.requestRender(); return true; }
      }
      return false;
    }
    if (phase === 'move' && P.drag?.hit) { const { r, i } = P.drag.hit; r.pts[i] = [clamp(p[0], 0, P.w), clamp(p[1], 0, P.h)]; app.requestRender(); return true; }
    if (phase === 'up' && P.drag?.hit) { const wasClosed = cur()?.closed; P.drag = null; if (wasClosed) rebuild(); app.requestRender(); return true; }
    return false;
  }
  function closeRing() {
    const s = cur(); if (!s) return;
    if (P.tool === 'hole') { if (s.hole.length >= 3) { snapshot(); s.holes.push(s.hole); s.hole = []; rebuild(); } return; }
    if (s.ring.length < 3) { app.say('Нужно хотя бы три точки.', 'warn'); return; }
    snapshot(); s.closed = true; P.step = 'outline'; app.say(''); rebuild(); renderPane();
  }
  function deletePoint(hit) {
    const s = cur(); const { r, i } = hit; const min = r.kind === 'ring' && s.closed ? 3 : r.kind === 'hole' ? 3 : 0;
    if (r.pts.length <= min) { app.say(r.kind === 'ring' ? 'Для контура нужно хотя бы три точки.' : 'Для области нужно хотя бы три точки.', 'warn'); return; }
    snapshot(); r.pts.splice(i, 1); P.sel = null; if (s.closed || r.kind === 'hole') rebuild(); renderPane(); app.requestRender();
  }

  // ------------------------------------------------------------------ масштаб по известному размеру
  function startKnown() { P.calib = { pts: [] }; app.say('Нажмите на два места на поверхности, расстояние между которыми вы знаете.'); }
  function finishKnown() {
    const s = cur(), [a, b] = P.calib.pts; P.calib = null;
    const r = surfaceH({ ...s, known: null }); const d = worldDistance(r.H, a, b);
    if (!(d > 0)) { app.say('Эти точки не подходят: выберите два разных места на поверхности ниже линии горизонта.', 'warn'); return; }
    const answer = window.prompt('Реальное расстояние между отмеченными точками, в метрах (например, 3,5):', '');
    const m = Number(String(answer || '').replace(',', '.'));
    if (!(m > 0.05 && m <= 200)) { app.say('Введите число от 0,05 до 200 метров.', 'warn'); return; }
    snapshot(); s.known = { a, b, m: Math.round(m * 100) / 100 }; app.say(''); refreshH(); renderPersp(s);
  }

  // ------------------------------------------------------------------ рисование поверх кадра
  function drawExtra(g, { fromPhoto }) {
    if (!P.photo) return; const dpr = overlay_k(), R = (mobile ? 11 : 8) * dpr;
    const poly = (pts, close, stroke, fill, dash) => { if (!pts.length) return; g.beginPath(); pts.forEach(([x, y], i) => { const [px, py] = fromPhoto(x, y); i ? g.lineTo(px, py) : g.moveTo(px, py); }); if (close) g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } g.lineWidth = 2 * dpr; g.strokeStyle = stroke; g.setLineDash(dash ? [8 * dpr, 6 * dpr] : []); g.stroke(); g.setLineDash([]); };
    const dot = (pt, label, active, color = '#fff') => { const [px, py] = fromPhoto(pt[0], pt[1]); g.beginPath(); g.arc(px, py, R, 0, Math.PI * 2); g.fillStyle = active ? '#ffcf3d' : color; g.fill(); g.lineWidth = 2 * dpr; g.strokeStyle = '#151515'; g.stroke(); if (label) { g.fillStyle = '#151515'; g.font = `600 ${Math.round(R * 1.1)}px Inter, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, px, py + 0.5); } };
    // маска исключений
    if (P.excl && P.step !== 'persp') { const k = P.w / P.excl.width, [x0, y0] = fromPhoto(0, 0), [x1] = fromPhoto(P.w, 0); g.save(); g.globalAlpha = 0.45; g.drawImage(P.excl, x0, y0, x1 - x0, (x1 - x0) * P.excl.height / P.excl.width); g.restore(); void k; }
    P.surfaces.forEach((s, i) => {
      const on = i === P.cur;
      if (s.ring.length) poly(s.ring, s.closed, on ? '#ffffff' : 'rgba(255,255,255,.55)', s.closed && on && P.step !== 'persp' ? 'rgba(255,207,61,.14)' : null, !s.closed);
      s.holes.forEach(h => poly(h, true, '#ff5a4d', 'rgba(255,90,77,.15)', false));
      if (on && s.hole.length) poly(s.hole, false, '#ff5a4d', null, true);
      if (on && P.step !== 'persp') { s.ring.forEach((p, j) => dot(p, j === 0 && !s.closed ? '●' : '', P.sel?.r.pts === s.ring && P.sel.i === j)); s.holes.forEach(h => h.forEach(p => dot(p, '', false, '#ffb3ac'))); s.hole.forEach((p, j) => dot(p, '', P.sel?.r.pts === s.hole && P.sel.i === j, '#ffb3ac')); }
    });
    const s = cur();
    if (P.step === 'persp' && s?.closed) {
      if (s.mode === 'quad' && s.quad) { poly(s.quad, true, '#ffcf3d', 'rgba(255,207,61,.10)', false); s.quad.forEach((p, j) => dot(p, String(j + 1), P.drag?.quad === j)); }
      if (s.mode === 'horizon') { const [, y] = fromPhoto(0, s.horizon.y * P.h); g.beginPath(); g.moveTo(0, y); g.lineTo(g.canvas.width, y); g.lineWidth = 2 * dpr; g.strokeStyle = '#ffcf3d'; g.setLineDash([12 * dpr, 8 * dpr]); g.stroke(); g.setLineDash([]); g.fillStyle = '#ffcf3d'; g.font = `600 ${12 * dpr}px Inter, Arial`; g.textAlign = 'left'; g.fillText('горизонт', 10 * dpr, y - 8 * dpr); }
      if (P.calib) P.calib.pts.forEach((p, j) => dot(p, String(j + 1), true));
      if (s.known && !P.calib) { dot(s.known.a, 'A', false, '#9be7a0'); dot(s.known.b, 'B', false, '#9be7a0'); }
    }
  }
  const overlay_k = () => engine.size.w / canvas.clientWidth;

  // ------------------------------------------------------------------ события панели
  pane.addEventListener('click', e => {
    const t = e.target, s = cur();
    const ps = t.closest('[data-psurf]'); if (ps) { P.cur = Number(ps.dataset.psurf); const z = S.source?.zones.find(z => z.id === cur().id); if (z) app.selectZone(z.id, { flash: false }); renderPane(); app.requestRender(); return; }
    if (t.closest('[data-plot-add]')) { if (P.surfaces.length < MAX_SURFACES) { snapshot(); P.surfaces.push(newSurface(P.surfaces.length + 1)); P.cur = P.surfaces.length - 1; P.tool = 'contour'; P.step = 'outline'; renderPane(); app.say('Обведите вторую поверхность: нажимайте точки по её краю.'); app.requestRender(); } return; }
    if (t.closest('[data-plot-del]')) { if (s) { snapshot(); P.surfaces.splice(P.cur, 1); if (!P.surfaces.length) P.surfaces.push(newSurface(1)); P.cur = Math.min(P.cur, P.surfaces.length - 1); renderPane(); rebuild(); } return; }
    const tool = t.closest('[data-tool]'); if (tool) { P.tool = tool.dataset.tool; P.step = 'outline'; P.calib = null; renderPane(); refreshH(); app.requestRender(); return; }
    if (t.closest('[data-plot-undo]')) { undo(); return; }
    if (t.closest('[data-plot-point-del]')) { if (P.sel) deletePoint(P.sel); else app.say('Сначала нажмите на точку.', 'warn'); return; }
    if (t.closest('[data-plot-close]')) { closeRing(); return; }
    if (t.closest('[data-plot-clear]')) { if (s) { snapshot(); s.ring = []; s.closed = false; s.holes = []; s.hole = []; s.quad = null; if (P.exclCtx) P.exclCtx.clearRect(0, 0, P.excl.width, P.excl.height); renderPane(); rebuild(); } return; }
    const pm = t.closest('[data-pmode]'); if (pm && s) { s.mode = pm.dataset.pmode; P.step = 'persp'; renderPane(); refreshH(); app.requestRender(); return; }
    if (t.closest('[data-quad-from]') && s) { const q = quadFromRing(s); if (q) { s.quad = q; refreshH(); app.requestRender(); } else app.say('Контур должен быть выпуклым четырёхугольником (4 точки).', 'warn'); return; }
    if (t.closest('[data-quad-reset]') && s) { s.quad = null; ensureQuad(s); refreshH(); app.requestRender(); return; }
    if (t.closest('[data-known-start]')) { P.step = 'persp'; startKnown(); return; }
  });
  pane.addEventListener('input', e => {
    const s = cur(); const t = e.target;
    if (t.matches('[data-brush]')) { P.brush = Number(t.value); return; }
    if (t.matches('[data-exposure]')) { S.exposure = Number(t.value) / 100; engine.setExposure(S.exposure); app.requestRender(); return; }
    if (!s) return;
    const hz = t.closest('[data-hz]'); if (hz) { const k = hz.dataset.hz, v = Number(hz.value); if (k === 'y') s.horizon.y = v / 100; else if (k === 'yaw') s.horizon.yaw = v; else if (k === 'height') { s.horizon.height = v; const o = hz.parentElement.querySelector('output'); if (o) o.textContent = String(v); } else if (k === 'fov') s.horizon.fov = v; s.horizon.touched = true; P.step = 'persp'; refreshH(); app.requestRender(); }
  });
  pane.addEventListener('change', e => {
    const s = cur(), t = e.target;
    const ty = t.closest('[data-ptype]'); if (ty) { P.surfaces[Number(ty.dataset.ptype)].type = ty.value; rebuild(); return; }
    if (t.matches('[data-plot-key]')) { P.key = t.checked; rebuild(); return; }
    const dim = t.closest('[data-dim]'); if (dim && s) { const v = Number(String(dim.value).replace(',', '.')); if (v >= 0.3 && v <= 200) { s.dims[dim.dataset.dim] = v; s.dims.touched = true; refreshH(); renderPersp(s); } else app.say('Размер — число от 0,3 до 200 метров.', 'warn'); return; }
  });
  root.addEventListener('focusin', e => { if (P.on && e.target.closest('[data-plot-step="persp"]')) { if (P.step !== 'persp') { P.step = 'persp'; refreshH(); app.requestRender(); } } else if (P.on && e.target.closest('[data-plot-step="surfaces"]') && P.step !== 'outline') { P.step = 'outline'; refreshH(); app.requestRender(); } });
  pane.addEventListener('pointerdown', e => { if (!P.on) return; const st = e.target.closest('[data-plot-step]'); if (st) { const want = st.dataset.plotStep === 'persp' ? 'persp' : 'outline'; if (want !== P.step) { P.step = want; if (want === 'persp' && cur()?.closed) ensureQuad(cur()); renderPane(); refreshH(); app.requestRender(); } } });

  // ------------------------------------------------------------------ черновик (только в этом браузере)
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DRAFT_DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('d'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function draftOp(mode, fn) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('d', mode), st = tx.objectStore('d'), req = fn(st); tx.oncomplete = () => res(req?.result); tx.onerror = () => rej(tx.error); }); }
  async function saveDraft() {
    if (!P.photo) { app.say('Сначала загрузите фото.', 'warn'); return; }
    try {
      const blob = await new Promise(r => P.photo.toBlob(r, 'image/jpeg', 0.85));
      await draftOp('readwrite', st => st.put({ photo: blob, w: P.w, h: P.h, surfaces: P.surfaces, excl: P.excl.toDataURL('image/png'), zones: S.zones, savedAt: Date.now() }, DRAFT_KEY));
      app.say('Черновик сохранён в этом браузере. Он хранится, пока вы не очистите данные сайта.'); renderDraft();
    } catch { app.say('Не удалось сохранить черновик: браузер запретил хранение (приватный режим?). Сохраните картинку кнопкой «Сохранить JPG».', 'warn'); }
  }
  async function loadDraft() {
    try {
      const d = await draftOp('readonly', st => st.get(DRAFT_KEY)); if (!d) return;
      const url = URL.createObjectURL(d.photo), img = await app.loadImage(url); URL.revokeObjectURL(url);
      startWith(app.drawPhoto(img, 2048), d); if (d.zones) Object.assign(S.zones, d.zones);
    } catch { app.say('Черновик не удалось открыть.', 'warn'); }
  }
  async function deleteDraft() { try { await draftOp('readwrite', st => st.delete(DRAFT_KEY)); } catch { /* нечего удалять */ } renderDraft(); }
  async function renderDraft() {
    const el = $('[data-draft]'); let d = null; try { d = await draftOp('readonly', st => st.get(DRAFT_KEY)); } catch { /* хранилище недоступно */ }
    el.innerHTML = `<div class="ol-row">${P.photo ? '<button type="button" class="ol-btn ol-btn--line" data-draft-save>Сохранить черновик</button>' : ''}${d ? `<button type="button" class="ol-btn ol-btn--line" data-draft-load>Продолжить: ${new Date(d.savedAt).toLocaleDateString('ru-RU')}</button><button type="button" class="ol-btn ol-btn--line" data-draft-del>Удалить черновик</button>` : ''}</div>${d || P.photo ? '<p class="ol-hint">Черновик (фото и разметка) хранится только в этом браузере и не отправляется на сервер.</p>' : ''}`;
  }
  root.addEventListener('click', e => { if (e.target.closest('[data-draft-save]')) saveDraft(); else if (e.target.closest('[data-draft-load]')) loadDraft(); else if (e.target.closest('[data-draft-del]')) deleteDraft(); });
  renderDraft();
  return { P, setMode, openFile, startWith, rebuild, doRebuild, refreshH };
}
