// Поведение MATERIAL LAB: сцена, жесты, свет, сутки, укладка, сравнение, каталог, съёмка. Разметку даёт ui.mjs, рендер — gl.mjs (WebGL 2) или canvas2d.mjs (запасной).
// Данные товаров не дублируются: витрина приходит со страницы (из каталога сайта), остальное лаборатория читает из data/catalog.json и data/picker.json.
import { LabGL } from './gl.mjs';
import { Canvas2DView } from './canvas2d.mjs';
import { unproject, project, panBy, zoomAt, clampTilt, basis } from './camera.mjs';
import { FORMATS, tileAt, variantOf, jointCm } from './layout.mjs';
import { detectTier, Adaptive, LEVELS, START_LEVEL } from './perf.mjs';
import { lightAt, lightAtWall, LIGHT_PRESETS, WALL_PRESETS, sweepFor, easeInOut, clamp01 } from './motion.mjs';
import { exportStill, exportVideo, videoSupport, EXPORT_SIZES } from './export.mjs';
import { skyAt, formatHour, presetOf, PRESETS, ROOM_CAM } from './timeofday.mjs';
import { toEntry, buildIndex, classify, applyOriginals, slabList, isSlab, SLAB_FORMAT, SLAB_PRIORITY } from './catalog.mjs';
import { createCatalogUI } from './catalog-ui.mjs';
import { matCard } from './ui.mjs';
import { encode, decode } from './composition.mjs';
import { attributesOf } from '../picker-text.mjs';
import { unpack, fromBase64 } from '../picker-features.mjs';
import { FEATURED_CODES } from './materials.mjs';

const $ = (r, s) => r.querySelector(s), $$ = (r, s) => [...r.querySelectorAll(s)];
const PIXEL_CAP = [2.8e6, 2.0e6, 1.2e6, 0.7e6, 0.45e6];
const SLAB_W = 120, SLAB_H = 278, SLAB_MAX_ROWS_TURNED = 2;
const HINTS = {
  day: 'Рассеянный свет из окна и далёкое солнце. Положение шара задаёт направление лучей.',
  evening: 'Тёплая лампа рядом с поверхностью: яркое пятно, быстрое затухание, мягкие тени швов.',
  side: 'Узкий луч почти вдоль поверхности: подчёркивает рельеф, блики и неровности.',
  time: 'Комната с окном: солнце, небо и лампа меняются в течение суток. Лампу — шар света — можно переносить.',
};
const TIER_TEXT = { high: 'Полное качество', medium: 'Среднее качество (мобильное устройство)', low: 'Упрощённый режим', fallback: 'Запасной режим (без WebGL 2)' };
const loadImage = src => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => rej(new Error('Не загрузилось фото материала')); i.src = src; });
function avgHex(img) {
  const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 8, 8);
  const d = g.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < 256; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  return [r, gg, b].map(v => Math.round(v / 64).toString(16).padStart(2, '0')).join('');
}
const cap = (el, id) => { try { el.setPointerCapture(id); } catch {} };
const fetchJson = async url => { const r = await fetch(url, { cache: 'force-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };

export async function startLab(root, cfg) {
  const canvas = $(root, '[data-canvas]'), orb = $(root, '[data-orb]'), status = $(root, '[data-status]');
  const featured = cfg.featured, mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const say = t => { status.textContent = t; };
  const HOME_ROOT = cfg.root || './';

  // ---- материалы: запись каталога → загруженное фото -----------------------------------------------------------------------------
  const matCache = new Map();
  function loadMaterial(entry) {
    if (!matCache.has(entry.code)) matCache.set(entry.code, loadImage(entry.image).then(img => ({ key: entry.code, source: img, photo: entry.photo, surf: entry.surf, quality: entry.quality, avgHex: avgHex(img), entry })).catch(e => { matCache.delete(entry.code); throw e; }));
    return matCache.get(entry.code);
  }
  let cur = featured[2] || featured[0], sec = featured.find(f => f.code !== cur.code) || featured[0];
  const hash = decode(cfg.hash ?? location.hash), hashEntry = hash.code && featured.find(f => f.code === hash.code);
  if (hashEntry) cur = hashEntry;
  say('Загружаю фотографии материалов…');
  let curM = await loadMaterial(cur), secM = null;

  // ---- вид: WebGL 2 или запасной Canvas 2D --------------------------------------------------------------------------------
  const q0 = (() => { try { return localStorage.getItem('lab-quality') || 'auto'; } catch { return 'auto'; } })(), lite0 = q0 === 'lite';
  let view, tier, level; const conn = navigator.connection || {};
  const probe = () => { try { const c = document.createElement('canvas'); const g = c.getContext('webgl2'); if (!g) return null; const d = g.getExtension('WEBGL_debug_renderer_info'); const r = { renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER), maxTexture: g.getParameter(g.MAX_TEXTURE_SIZE) }; g.getExtension('WEBGL_lose_context')?.loseContext(); return r; } catch { return null; } };
  const pr = LabGL.supported() ? probe() : null;
  const t = detectTier({ webgl2: !!pr, mobile, cores: navigator.hardwareConcurrency || 4, memory: navigator.deviceMemory || 4, renderer: pr?.renderer || '', maxTexture: pr?.maxTexture || 0, reducedMotion: reduced, saveData: !!conn.saveData, forceLite: lite0 });
  tier = t.tier; level = START_LEVEL[tier];
  try { if (tier === 'fallback') throw new Error('no webgl'); view = new LabGL(canvas, { level }); view.setSlots([curM, curM]); }
  catch (e) { console.warn('[lab] запасной режим:', e.message); view = new Canvas2DView(canvas); view.setSlots([curM, curM]); tier = 'fallback'; level = 4; $(root, '[data-tilt]')?.closest('.lab-field')?.setAttribute('hidden', ''); }
  const adaptive = new Adaptive(level, { slowMs: 34, fastMs: 18.5, min: lite0 ? 3 : 0, max: q0 === 'quality' ? 0 : 4 });
  root.dataset.tier = tier; root.dataset.state = 'ready';

  // ---- состояние -----------------------------------------------------------------------------------------------------------
  const st = {
    view: 'floor', slabs: 2, a: 0, b: 0, mode: 'evening', light: { x: 40, y: 30, h: 60 }, heightK: 1, hour: 13,
    cam: { center: [0, 0], rot: 0, tilt: 0.62, ppcm: 4 }, format: '60x60', turned: false, jointMm: 2, jointColor: 'white', bond: 'straight',
    compare: false, split: 0.5, tone: 0.05, sweep: { on: false }, exposure: 1,
  };
  let angle = LIGHT_PRESETS.evening.phase, hoverUntil = 0, intro0 = performance.now(), auto = !reduced, dragMode = 'move', dirty = true, lastT = 0, trans = null, splitAnim = null, camAnim = null, hourAnim = null, dayPlay = false, camBefore = null;
  let slabsCache = null, floorSaved = null, touched = false, exporting = false, lite = lite0, shareSize = 'story', selToken = 0, slotsKey = '', recents = [];
  let target = { ...lightAt('evening', angle) };
  const cssSize = () => { const r = canvas.getBoundingClientRect(); return [Math.max(1, r.width), Math.max(1, r.height)]; };
  const tileDims = () => { if (st.view === 'slabs') return st.turned ? { w: SLAB_H, h: SLAB_W } : { w: SLAB_W, h: SLAB_H }; const f = FORMATS.find(x => x.id === st.format); return st.turned ? { w: f.h, h: f.w } : { w: f.w, h: f.h }; };
  /** Стена из слэбов в реальном масштабе (см): число плит, прямоугольник, центр. Плиты стоят вертикально; повёрнутые — горизонтально, не выше двух. */
  function wallGeom() {
    const t = tileDims(), j = jointCm(st.jointMm), cols = st.turned ? 1 : st.slabs, rows = st.turned ? Math.min(st.slabs, SLAB_MAX_ROWS_TURNED) : 1, px = t.w + j, py = t.h + j;
    const x0 = j / 2, y0 = j / 2, x1 = cols * px - j / 2, y1 = rows * py - j / 2;
    return { cols, rows, rect: [x0, y0, x1, y1], w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  /** Камера «стена целиком»: стена помещается в полосу между верхней строкой и галереей и стоит по её центру. */
  function wallCam(extra = {}) {
    const g = wallGeom(), [w, h] = cssSize(), gh = $(root, '[data-gallery]').offsetHeight, open = !$(root, '[data-panel]').classList.contains('is-folded');
    const galBottom = mobile ? (open ? 346 : 52) : Math.max(12, Math.min(30, h * 0.03)), top = mobile ? 100 : 70, bottom = Math.max(top + 120, h - galBottom - gh - 10), bandH = bottom - top;     // не по текущему положению галереи (оно может быть посреди анимации), а по её итоговому
    const ppcm = Math.max(0.5, Math.min(0.86 * w / g.w, 0.92 * bandH / g.h, 40)), shift = (h / 2 - (top + bottom) / 2) / ppcm;
    return { center: [g.cx, g.cy - shift], rot: 0, tilt: 0.04, ppcm, ...extra };
  }
  const zl = () => [st.view === 'slabs' ? 0.5 : 1.2, Math.max(2, cur.maxPpcm || 40)];
  const fitZoom = () => { const [w] = cssSize(); st.cam.ppcm = Math.min(zl()[1], Math.max(1.2, w / (mobile ? 130 : 230))); };
  const fallbackless = () => tier !== 'fallback';
  const resetView = () => { camAnim = null; if (st.view === 'slabs') { Object.assign(st.cam, wallCam({ tilt: fallbackless() ? 0.04 : 0 })); syncSliders(); dirty = true; return; } st.cam.center = [0, 0]; st.cam.rot = 0; st.cam.tilt = fallbackless() ? 0.62 : 0; fitZoom(); if (st.mode === 'time') flyCam(ROOM_CAM); syncSliders(); dirty = true; };
  function flyCam(to, ms = 1100) { camAnim = { from: { center: [...st.cam.center], rot: st.cam.rot, tilt: st.cam.tilt, ppcm: st.cam.ppcm }, to: { center: [...(to.center || st.cam.center)], rot: to.rot ?? st.cam.rot, tilt: to.tilt ?? st.cam.tilt, ppcm: to.ppcm ?? st.cam.ppcm }, t0: performance.now(), dur: reduced ? 1 : ms }; dirty = true; }
  function resize() {
    const [w, h] = cssSize(), dpr = Math.min(devicePixelRatio || 1, 2), lv = LEVELS[view.level ?? level] || LEVELS[0];
    let k = dpr * lv.scale; const capPx = PIXEL_CAP[Math.min(view.level ?? level, 4)]; if (w * h * k * k > capPx) k = Math.sqrt(capPx / (w * h));
    const W = Math.max(2, Math.round(w * k)), H = Math.max(2, Math.round(h * k));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; dirty = true; }
  }
  /** Нужные материалы в двух ячейках GL и номера ячеек для кадра. */
  function wanted() {
    if (trans) return { slots: [trans.fromM, trans.toM], a: 0, b: 1 };
    if (st.compare && secM) return { slots: [secM, curM], a: 0, b: 1 };
    return { slots: [curM, curM], a: 0, b: 0 };
  }
  function syncSlots() { const w = wanted(), key = w.slots.map(m => m.key).join('|'); if (key !== slotsKey) { view.setSlots(w.slots); slotsKey = key; } return w; }
  function renderState() {
    const w = wanted(), s = { ...st, a: w.a, b: w.b, tile: tileDims(), joint: jointCm(st.jointMm), light: { ...st.light }, turn: st.turned };
    if (st.view === 'slabs') { s.wall = { rect: wallGeom().rect }; s.tone = 0; s.bond = 'straight'; }
    const sw = { ...st.sweep };
    if (st.compare && secM && !trans) { const aspect = canvas.width / canvas.height; Object.assign(sw, { on: true, pos: (st.split - 0.5) * aspect, dir: [1, 0], soft: 0.0015, line: true, glow: 0 }); }
    else if (trans) sw.line = false; else sw.on = false;
    s.sweep = sw; if (st.mode === 'time') s.sky = skyAt(st.hour); return s;
  }

  // ---- UI: материал, витрина, товар -----------------------------------------------------------------------------------------------
  const strip = $(root, '[data-strip]');
  function renderStrip() {
    const list = st.view === 'slabs' ? (slabsCache || []) : [...recents.filter(r => !featured.some(f => f.code === r.code)), ...featured];
    strip.innerHTML = list.map(m => matCard(m)).join('');
    $$(strip, '[data-mat]').forEach(b => { const on = b.dataset.mat === cur.code; b.setAttribute('aria-checked', String(on)); if (on) { try { const l = b.offsetLeft - strip.clientWidth / 2 + b.offsetWidth / 2; strip.scrollTo({ left: Math.max(0, l), behavior: reduced || !touched ? 'auto' : 'smooth' }); } catch {} } });
  }
  const syncSecond = () => {
    $(root, '[data-second-img]').src = sec.image; $(root, '[data-second-name]').textContent = sec.name; $(root, '[data-second-code]').textContent = `арт. ${sec.code} · ${sec.quality === 'hd' ? 'полная симуляция' : 'упрощённо'}`;
    $$(root, '[data-second]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.second === sec.code)));
  };
  function updateNotice() {
    const n = $(root, '[data-notice]'), m = cur;
    if (m.quality === 'hd') { n.hidden = true; return; }
    $(root, '[data-notice-text]').textContent = st.view === 'slabs' ? `Эскизный просмотр: фото каталога ${m.imgW}×${m.imgH} px, детали не дорисовываются.` : `Упрощённый просмотр: фото ${m.imgW}×${m.imgH} px.`;
    const a = $(root, '[data-notice-link]'); a.href = m.href; n.hidden = false;
  }
  function renderQuick() {
    const list = st.view === 'slabs' ? (slabsCache || []).slice(0, 10) : featured, q = $(root, '[data-second-quick]');
    q.innerHTML = list.map(m => `<button type="button" role="radio" aria-checked="${m.code === sec.code}" data-second="${m.code}" title="${m.name}"><img src="${m.image}" alt="${m.name}" width="44" height="44" loading="lazy" decoding="async"></button>`).join('');
  }
  function updateItem() {
    const m = cur; $(root, '[data-item-collection]').textContent = m.collection; $(root, '[data-item-name]').textContent = m.name;
    $(root, '[data-item-meta]').textContent = `Арт. ${m.code} · ${m.format} · ${m.finish}`; $(root, '[data-item-price]').textContent = m.priceText || '';
    $(root, '[data-item-quality]').textContent = m.quality === 'hd' ? `Полная симуляция света: фото ${m.imgW}×${m.imgH} px.` : `Упрощённый режим: фото ${m.imgW}×${m.imgH} px. Рельеф и зерно не дорисовываются, приближение ограничено.`;
    const link = $(root, '[data-item-link]'); link.href = m.href; const add = $(root, '[data-item-add]');
    if (add) { add.dataset.add = m.code; add.disabled = m.canOrder === false; add.textContent = 'В корзину'; delete add.dataset.label; document.dispatchEvent(new CustomEvent('italon:cart-refresh')); }
    root.dataset.material = m.code; root.dataset.quality = m.quality; updateNotice();
  }
  function touch() { if (!touched) { touched = true; root.classList.add('is-touched'); } }
  let loadingTimer = 0;
  /** Выбор материала: фото загружается заранее, затем — переход световой шторкой. */
  async function selectEntry(entry, { animate = true, silent = false } = {}) {
    if (!entry?.eligible) return false;
    if (entry.code === cur.code && !trans) return true;
    const my = ++selToken; clearTimeout(loadingTimer); loadingTimer = setTimeout(() => say(`Загружаю «${entry.name}»…`), 220);
    let m; try { m = await loadMaterial(entry); m = m; view.prepare?.(m); } catch (e) { clearTimeout(loadingTimer); say('Не удалось загрузить фото: ' + e.message); return false; }
    clearTimeout(loadingTimer); if (my !== selToken) return false; if (!silent) say('');
    const old = curM; if (st.compare && sec.code === entry.code) { sec = cur; secM = old; syncSecond(); }
    cur = entry; curM = m;
    if (st.view === 'floor' && !featured.some(f => f.code === entry.code)) recents = [entry, ...recents.filter(r => r.code !== entry.code)].slice(0, 4);
    if (animate && !st.compare && !reduced && !exporting) trans = { fromM: old, toM: m, t0: performance.now(), dur: 1500 };
    renderStrip(); updateItem(); if (st.cam.ppcm > zl()[1]) flyCam({ ppcm: zl()[1] }, 700); dirty = true; touch(); return true;
  }
  async function selectSecond(entry) {
    if (!entry?.eligible) return false; const m = await loadMaterial(entry);
    if (entry.code === cur.code) return false; sec = entry; secM = m; syncSecond(); if (!st.compare) setCompare(true); dirty = true; touch(); return true;
  }

  // ---- каталог ---------------------------------------------------------------------------------------------------------------------
  const loader = {
    async catalog() {
      let products = cfg.loadProducts ? await cfg.loadProducts() : (await fetchJson(cfg.catalogUrl)).products;
      try { const man = cfg.loadOriginals ? await cfg.loadOriginals() : (cfg.originalsUrl ? await fetchJson(cfg.originalsUrl) : null); if (man) products = applyOriginals(products, man); } catch { /* оригиналов нет — работаем с фото каталога */ }
      const fe = new Map(featured.map(f => [f.code, f])), byCode = new Map(), prods = new Map(products.map(p => [p.code, p]));
      const entries = products.map(p => { const e = fe.get(p.code) || toEntry(p, { root: HOME_ROOT, imageUrl: cfg.imageUrl }); byCode.set(p.code, e); return e; });
      return { entries, eligible: entries.filter(e => e.eligible), index: buildIndex(products, p => byCode.get(p.code)), byCode, products: prods };
    },
    async features() {
      const [pj, data] = await Promise.all([cfg.loadPicker ? cfg.loadPicker() : fetchJson(cfg.pickerUrl), catalogUI.ensure()]);
      const map = new Map();
      for (const e of data.eligible) { const p = data.products.get(e.code), key = String(p?.image?.src || '').replace(/^\//, ''), b64 = pj?.items?.[key]; if (!b64) continue; try { map.set(e.code, classify(attributesOf(p, unpack(fromBase64(b64))))); } catch {} }
      return map;
    },
  };
  const catalogUI = createCatalogUI(root, { loader, featuredCodes: FEATURED_CODES, getCurrent: () => cur, getSecond: () => sec, onPick: (entry, mode) => (mode === 'second' ? selectSecond(entry) : selectEntry(entry)) });
  const SLAB_SCOPE = () => ({ format: SLAB_FORMAT, title: 'Слэбы 120×278', sub: 'Большие плиты 120 × 278 см: поиск по названию и артикулу, фильтры по коллекции и цвету', order: SLAB_PRIORITY });
  const openCatalog = (mode, from) => catalogUI.open(mode, from, st.view === 'slabs' ? SLAB_SCOPE() : null);
  $$(root, '[data-open-catalog]').forEach(b => b.addEventListener('click', () => { touch(); openCatalog('main', b); }));
  $(root, '[data-second-open]').addEventListener('click', e => openCatalog('second', e.currentTarget));
  // предзагрузка каталога, когда браузер свободен — окно открывается мгновенно
  (window.requestIdleCallback || (f => setTimeout(f, 2500)))(() => catalogUI.ensure().catch(() => {}), { timeout: 6000 });

  // ---- раздел «Слэбы 120×278»: стена из больших плит в реальном масштабе -----------------------------------------------------------
  function applyViewUi() {
    const slabs = st.view === 'slabs';
    $$(root, '[data-for="slabs"]').forEach(e => { e.hidden = !slabs; }); $$(root, '[data-for="floor"]').forEach(e => { e.hidden = slabs; });
    $$(root, '[data-view]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.view === st.view)));
    $(root, '[data-gallery-title]').textContent = slabs ? 'Слэбы 120×278' : 'Выберите материал';
    $(root, '[data-gallery-sub]').textContent = slabs ? `${(slabsCache || []).length} больших плит в масштабе стены · ${new Set((slabsCache || []).map(e => e.collectionId)).size} коллекций` : `${featured.length} популярных материалов для быстрого старта`;
    $(root, '[data-open-label]').textContent = slabs ? 'Все слэбы' : 'Все материалы';
    $(root, '[data-turn-label]').textContent = slabs ? (st.turned ? 'Поставить вертикально' : 'Положить горизонтально') : 'Повернуть на 90°';
    $(root, '[data-turn]').setAttribute('aria-pressed', String(st.turned));
    $$(root, '[data-format]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.format === st.format)));
    $$(root, '[data-slabs]').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.slabs === st.slabs)));
    $$(root, '[data-jc]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.jc === st.jointColor)));
    $$(root, '[data-seg="bond"]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === st.bond)));
    $(root, '[data-joint]').value = st.jointMm; $(root, '[data-joint-out]').textContent = String(st.jointMm).replace('.', ',');
  }
  let viewBusy = false;
  async function setView(v, { code, second, instant = false } = {}) {
    if (viewBusy) return false; if (v === st.view) { applyViewUi(); return true; } viewBusy = true; touch();
    try {
      if (v === 'slabs') {
        say('Загружаю слэбы…'); let d; try { d = await catalogUI.ensure(); } catch (e) { say('Не удалось загрузить каталог слэбов: ' + e.message); applyViewUi(); return false; }
        const slabs = slabList(d.entries); if (!slabs.length) { say('В каталоге нет слэбов 120×278.'); applyViewUi(); return false; } slabsCache = slabs; say('');
        floorSaved = { cur, sec, format: st.format, turned: st.turned, bond: st.bond, jointMm: st.jointMm, jointColor: st.jointColor, mode: st.mode, cam: { center: [...st.cam.center], rot: st.cam.rot, tilt: st.cam.tilt, ppcm: st.cam.ppcm } };
        if (st.compare) await setCompare(false); camBefore = null; selToken++; trans = null; st.sweep = { on: false };
        st.view = 'slabs'; root.dataset.labView = 'slabs'; st.turned = false; st.bond = 'straight'; st.jointMm = 3; st.jointColor = 'tone';
        const pick = slabs.find(x => x.code === code) || (isSlab(cur) ? cur : slabs[0]); cur = pick; curM = await loadMaterial(pick); sec = slabs.find(x => x.code === second) || slabs.find(x => x.code !== pick.code);
        setMode(st.mode, { fly: false }); applyViewUi(); renderStrip(); renderQuick(); syncSecond(); updateItem();
        const cam = wallCam({ ppcm: Math.min(wallCam().ppcm, zl()[1]) }); if (instant || reduced) Object.assign(st.cam, cam); else flyCam(cam, 1100); syncSliders();
      } else {
        const f = floorSaved || { cur: featured[2] || featured[0], sec: featured[0], format: '60x60', turned: false, bond: 'straight', jointMm: 2, jointColor: 'white', mode: 'evening' };
        st.view = 'floor'; root.dataset.labView = 'floor'; Object.assign(st, { format: f.format, turned: f.turned, bond: f.bond, jointMm: f.jointMm, jointColor: f.jointColor }); selToken++; trans = null; st.sweep = { on: false };
        cur = f.cur; curM = await loadMaterial(cur); sec = f.sec; setMode(f.mode === 'time' ? 'evening' : f.mode, { fly: false }); applyViewUi(); renderStrip(); renderQuick(); syncSecond(); updateItem();
        if (f.cam) { if (instant || reduced) Object.assign(st.cam, f.cam); else flyCam(f.cam, 1000); } syncSliders();
      }
      dirty = true; return true;
    } finally { viewBusy = false; applyViewUi(); }
  }

  // ---- режимы света и сутки ------------------------------------------------------------------------------------------------------
  const clock = $(root, '[data-clock]');
  function syncSliders() { const q = s => $(root, s); q('[data-tilt]').value = st.cam.tilt; q('[data-rot]').value = Math.max(-3.14, Math.min(3.14, st.cam.rot)); }
  function updateClock() {
    const h = st.hour; $(root, '[data-hour]').value = h; $(root, '[data-hour-out]').textContent = formatHour(h); const p = PRESETS.find(x => x.id === presetOf(h));
    clock.textContent = `${formatHour(h)} · ${p.label}`; $$(root, '[data-tpreset]').forEach(b => b.setAttribute('aria-checked', String(Math.abs(+b.dataset.at - h) < 0.35)));
  }
  const lightFor = (mode, a, k) => (st.view === 'slabs' ? lightAtWall(mode, a, k) : lightAt(mode, a, k));
  const presetOf2 = mode => (st.view === 'slabs' ? WALL_PRESETS[mode] : LIGHT_PRESETS[mode]);
  function setMode(mode, { fly = true } = {}) {
    const was = st.mode; st.mode = mode; $$(root, '[data-mode]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
    $(root, '[data-mode-hint]').textContent = st.view === 'slabs' && mode === 'time' ? 'Стена в течение суток: цвет и сила света меняются от утра к ночи, лампа у стены — шар света.' : HINTS[mode]; root.dataset.labMode = mode; clock.hidden = mode !== 'time';
    if (st.view === 'slabs') {
      if (mode === 'time') { target = { x: -70, y: 40, h: 42 }; st.light = { ...target }; setAuto(false); updateClock(); }
      else { angle = LIGHT_PRESETS[mode].phase; target = lightAtWall(mode, angle, st.heightK); if (was === 'time') setAuto(!reduced); }
      stopDay(); syncSliders(); dirty = true; return;
    }
    if (mode === 'time') {
      if (was !== 'time') { camBefore = { center: [...st.cam.center], rot: st.cam.rot, tilt: st.cam.tilt, ppcm: st.cam.ppcm }; if (fly) flyCam(ROOM_CAM, 1300); else Object.assign(st.cam, { ...ROOM_CAM, center: [...ROOM_CAM.center] }); }
      target = { x: -45, y: -8, h: 95 }; st.light = { ...target }; setAuto(false); updateClock();
    } else {
      if (was === 'time' && camBefore) { if (fly) flyCam(camBefore, 1100); else Object.assign(st.cam, camBefore); camBefore = null; }
      angle = LIGHT_PRESETS[mode].phase; target = lightAt(mode, angle, st.heightK); if (was === 'time') setAuto(!reduced);
    }
    stopDay(); syncSliders(); dirty = true;
  }
  function setHour(h, { animate = false, ms = 1700 } = {}) { if (animate && !reduced) hourAnim = { from: st.hour, to: h, t0: performance.now(), dur: ms }; else { hourAnim = null; st.hour = h; updateClock(); } dirty = true; }
  function stopDay() { dayPlay = false; const b = $(root, '[data-day-play]'); b.setAttribute('aria-pressed', 'false'); b.querySelector('span').textContent = 'Сутки за 14 секунд'; }
  function setAuto(v) { auto = v; const b = $(root, '[data-auto]'); b.setAttribute('aria-pressed', String(v)); b.querySelector('span').textContent = v ? 'Свет движется' : 'Свет остановлен'; dirty = true; }
  const seg = (sel, attr, cb) => root.addEventListener('click', e => { const b = e.target.closest(sel); if (!b || b === root || !root.contains(b)) return; $$(b.parentElement, sel).forEach(x => x.setAttribute('aria-checked', String(x === b))); cb(b.dataset[attr], b); dirty = true; touch(); });
  seg('[data-mode]', 'mode', v => setMode(v));
  seg('[data-format]', 'format', v => { st.format = v; });
  seg('[data-jc]', 'jc', v => { st.jointColor = v; });
  seg('[data-seg="bond"]', 'value', v => { st.bond = v; });
  seg('[data-drag]', 'drag', v => { dragMode = v; });
  seg('[data-size]', 'size', v => { shareSize = v; });
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-mat]'); if (b) { const code = b.dataset.mat, ent = [...recents, ...featured, ...(slabsCache || [])].find(f => f.code === code); if (ent) selectEntry(ent); }
    const s2 = e.target.closest('[data-second]'); if (s2) { const ent = [...featured, ...(slabsCache || [])].find(f => f.code === s2.dataset.second); if (ent) selectSecond(ent); }
    const tp = e.target.closest('[data-tpreset]'); if (tp) { if (st.mode !== 'time') setMode('time'); stopDay(); setHour(+tp.dataset.at, { animate: true }); touch(); }
  });
  const refitWall = () => { if (st.view === 'slabs') flyCam(wallCam({ ppcm: Math.min(wallCam().ppcm, zl()[1]) }), 700); };
  $(root, '[data-turn]').addEventListener('click', e => { st.turned = !st.turned; e.currentTarget.setAttribute('aria-pressed', String(st.turned)); applyViewUi(); refitWall(); dirty = true; touch(); });
  seg('[data-slabs]', 'slabs', v => { st.slabs = +v; refitWall(); });
  seg('[data-view]', 'view', v => { setView(v); });
  $(root, '[data-auto]').addEventListener('click', () => setAuto(!auto));
  $(root, '[data-reset]').addEventListener('click', resetView);
  $(root, '[data-day-play]').addEventListener('click', () => {
    if (dayPlay) { stopDay(); hourAnim = null; return; }
    if (st.mode !== 'time') setMode('time'); dayPlay = true; const b = $(root, '[data-day-play]'); b.setAttribute('aria-pressed', 'true'); b.querySelector('span').textContent = 'Остановить'; touch();
    hourAnim = { from: 6.2, to: 23.8, t0: performance.now() + 250, dur: reduced ? 1 : 14000, day: true }; st.hour = 6.2;
  });
  const onInput = (sel, fn) => $(root, sel).addEventListener('input', e => { fn(+e.target.value); dirty = true; touch(); });
  onInput('[data-joint]', v => { st.jointMm = v; $(root, '[data-joint-out]').textContent = String(v).replace('.', ','); });
  onInput('[data-height]', v => { st.heightK = v; if (st.mode === 'time') { st.light.h = target.h = (st.view === 'slabs' ? 20 : 40) + 55 * v; } else target = lightFor(st.mode, angle, v); });
  onInput('[data-tilt]', v => { camAnim = null; st.cam.tilt = clampTilt(v); });
  onInput('[data-rot]', v => { camAnim = null; pivotRotate(v - st.cam.rot, cssSize()[0] / 2, cssSize()[1] / 2); });
  onInput('[data-hour]', v => { stopDay(); hourAnim = null; st.hour = v; updateClock(); });
  // вкладки и сворачивание панели
  const tabs = $$(root, '[data-tab]'), panel = $(root, '[data-panel]');
  const unfold = open => { panel.classList.toggle('is-folded', !open); $(root, '[data-fold]').setAttribute('aria-expanded', String(open)); if (st.view === 'slabs' && mobile) setTimeout(refitWall, 340); };
  const openTab = (id, focus) => { tabs.forEach(tb => { const on = tb.dataset.tab === id; tb.setAttribute('aria-selected', String(on)); tb.tabIndex = on ? 0 : -1; if (on && focus) tb.focus(); }); $$(root, '[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== id; }); unfold(true); };
  tabs.forEach(tb => { tb.tabIndex = tb.getAttribute('aria-selected') === 'true' ? 0 : -1; tb.addEventListener('click', () => { touch(); if (tb.getAttribute('aria-selected') === 'true' && !panel.classList.contains('is-folded')) unfold(false); else openTab(tb.dataset.tab); if (tb.dataset.tab === 'time' && st.mode !== 'time') { /* вид сутки включается кнопкой режима или пресетом */ } }); });
  $(root, '[data-panel] .lab__tabs').addEventListener('keydown', e => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; const i = tabs.findIndex(x => x === document.activeElement); if (i < 0) return; const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; openTab(n.dataset.tab, true); e.preventDefault(); });
  $(root, '[data-fold]').addEventListener('click', () => { unfold(panel.classList.contains('is-folded')); });
  $(root, '[data-start]').addEventListener('click', () => { touch(); openTab('light'); if (mobile) unfold(false); });

  // ---- сравнение и переход ---------------------------------------------------------------------------------------------------------
  const split = $(root, '[data-split]'), splitHandle = $(root, '[data-split-handle]');
  async function setCompare(on) {
    if (on) { secM = await loadMaterial(sec); if (sec.code === cur.code) { sec = featured.find(f => f.code !== cur.code); secM = await loadMaterial(sec); } syncSecond(); }
    st.compare = on; $(root, '[data-compare]').setAttribute('aria-pressed', String(on)); split.hidden = !on; if (on) { st.split = 0.5; placeSplit(); } dirty = true; touch();
  }
  const placeSplit = () => { splitHandle.style.left = `${st.split * 100}%`; };
  $(root, '[data-compare]').addEventListener('click', () => setCompare(!st.compare));
  $(root, '[data-transition]').addEventListener('click', async () => { touch(); if (st.compare) { splitAnim = { t0: performance.now(), dur: 2600 }; dirty = true; } else { const list = featured.filter(f => f.code !== cur.code); selectEntry(sec.code !== cur.code ? sec : list[0]); } });
  let splitDrag = false;
  splitHandle.addEventListener('pointerdown', e => { splitDrag = true; cap(splitHandle, e.pointerId); splitAnim = null; e.preventDefault(); });
  splitHandle.addEventListener('pointermove', e => { if (!splitDrag) return; const r = canvas.getBoundingClientRect(); st.split = clamp01((e.clientX - r.left) / r.width); placeSplit(); dirty = true; });
  const endSplit = () => { splitDrag = false; }; splitHandle.addEventListener('pointerup', endSplit); splitHandle.addEventListener('pointercancel', endSplit);
  splitHandle.addEventListener('keydown', e => { const d = e.key === 'ArrowLeft' ? -0.03 : e.key === 'ArrowRight' ? 0.03 : 0; if (d) { st.split = clamp01(st.split + d); placeSplit(); dirty = true; e.preventDefault(); } });

  // ---- жесты ---------------------------------------------------------------------------------------------------------------------
  const ptrs = new Map(); let gesture = null;
  function pivotRotate(d, px, py) { const [w, h] = cssSize(), before = unproject(st.cam, px, py, w, h); st.cam.rot += d; const after = unproject(st.cam, px, py, w, h); if (before && after) st.cam.center = [st.cam.center[0] + before[0] - after[0], st.cam.center[1] + before[1] - after[1]]; syncSliders(); dirty = true; }
  const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', e => {
    cap(canvas, e.pointerId); ptrs.set(e.pointerId, pos(e)); touch(); camAnim = null; canvas.focus({ preventScroll: true });
    gesture = { rotateBtn: e.button === 2 || e.shiftKey || e.button === 1 }; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; gesture.d = Math.hypot(a[0] - b[0], a[1] - b[1]); gesture.ang = Math.atan2(b[1] - a[1], b[0] - a[0]); }
  });
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') orb.style.pointerEvents = ''; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) { if (e.pointerType === 'mouse' && e.buttons === 0 && !orbDrag && !exporting) { const [px, py] = pos(e); moveLightTo(px, py); hoverUntil = performance.now() + 2500; orb.style.pointerEvents = 'none'; } return; }
    const prev = ptrs.get(e.pointerId), cur2 = pos(e), [w, h] = cssSize(); ptrs.set(e.pointerId, cur2);
    if (ptrs.size === 1) {
      if (dragMode === 'rotate' || gesture?.rotateBtn) { pivotRotate((cur2[0] - prev[0]) * 0.006, w / 2, h / 2); st.cam.tilt = clampTilt(st.cam.tilt + (cur2[1] - prev[1]) * 0.004); syncSliders(); }
      else panBy(st.cam, prev[0], prev[1], cur2[0], cur2[1], w, h);
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (gesture?.d) { zoomAt(st.cam, d / gesture.d, mx, my, w, h, zl()); let da = ang - gesture.ang; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; pivotRotate(da, mx, my); }
      gesture = { ...gesture, d, ang };
    }
    dirty = true;
  });
  const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2 && gesture) gesture.d = 0; if (!ptrs.size) gesture = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); camAnim = null; const [px, py] = pos(e), [w, h] = cssSize(); if (e.shiftKey) pivotRotate(e.deltaY * 0.002, w / 2, h / 2); else zoomAt(st.cam, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), px, py, w, h, zl()); touch(); dirty = true; }, { passive: false });
  canvas.addEventListener('keydown', e => {
    const [w, h] = cssSize(), k = e.shiftKey ? 3 : 1, step = 40 * k; let used = true; camAnim = null;
    if (e.key === 'ArrowLeft') panBy(st.cam, w / 2, h / 2, w / 2 + step, h / 2, w, h); else if (e.key === 'ArrowRight') panBy(st.cam, w / 2, h / 2, w / 2 - step, h / 2, w, h);
    else if (e.key === 'ArrowUp') panBy(st.cam, w / 2, h / 2, w / 2, h / 2 + step, w, h); else if (e.key === 'ArrowDown') panBy(st.cam, w / 2, h / 2, w / 2, h / 2 - step, w, h);
    else if (e.key === '+' || e.key === '=') zoomAt(st.cam, 1.15, w / 2, h / 2, w, h, zl()); else if (e.key === '-' || e.key === '_') zoomAt(st.cam, 1 / 1.15, w / 2, h / 2, w, h, zl());
    else if (e.key === 'q' || e.key === 'Q') pivotRotate(-0.08, w / 2, h / 2); else if (e.key === 'e' || e.key === 'E') pivotRotate(0.08, w / 2, h / 2);
    else if (e.key === 'PageUp') st.cam.tilt = clampTilt(st.cam.tilt + 0.06); else if (e.key === 'PageDown') st.cam.tilt = clampTilt(st.cam.tilt - 0.06);
    else used = false;
    if (used) { e.preventDefault(); syncSliders(); dirty = true; touch(); }
  });
  // «шар света»: перетаскивание по поверхности
  let orbDrag = false;
  function moveLightTo(px, py) {
    const [w, h] = cssSize(), cam = st.cam; let P = unproject(cam, px, py, w, h); if (!P) return;
    const hh = st.light.h, Q = (() => { const s = project(cam, [P[0], P[1], hh], w, h); return s ? unproject(cam, s[0], s[1], w, h) : P; })() || P;
    P = [P[0] + (P[0] - Q[0]), P[1] + (P[1] - Q[1])]; let dx = P[0] - cam.center[0], dy = P[1] - cam.center[1]; const r = Math.hypot(dx, dy), max = 160; if (r > max) { dx *= max / r; dy *= max / r; }
    st.light.x = dx; st.light.y = dy; target = { x: dx, y: dy, h: st.light.h }; angle = Math.atan2(dy / 0.7, dx); dirty = true;
  }
  orb.addEventListener('pointerdown', e => { orbDrag = true; cap(orb, e.pointerId); setAuto(false); touch(); e.preventDefault(); orb.classList.add('is-drag'); });
  orb.addEventListener('pointermove', e => { if (orbDrag) { const [px, py] = pos(e); moveLightTo(px, py); } });
  const orbUp = () => { orbDrag = false; orb.classList.remove('is-drag'); }; orb.addEventListener('pointerup', orbUp); orb.addEventListener('pointercancel', orbUp);
  orb.addEventListener('keydown', e => { const m = { ArrowLeft: [-6, 0], ArrowRight: [6, 0], ArrowUp: [0, 6], ArrowDown: [0, -6] }[e.key]; if (!m) return; setAuto(false); st.light.x += m[0]; st.light.y += m[1]; target = { ...st.light }; dirty = true; e.preventDefault(); });

  // ---- кадр ------------------------------------------------------------------------------------------------------------------------
  const perfEl = $(root, '[data-perf]'); let fpsAcc = 0, fpsN = 0, lastPerfText = 0;
  function describePerf() { const lv = view.level ?? level; perfEl.textContent = `${TIER_TEXT[tier]}${tier === 'fallback' ? '' : ` · уровень ${lv + 1}/${LEVELS.length}`}${view.info?.renderer ? ' · ' + view.info.renderer.replace(/\s*\(.*$/, '').slice(0, 40) : ''}`; }
  function frame(now) {
    requestAnimationFrame(frame); if (document.hidden || exporting) { lastT = now; return; }
    const dt = Math.min(0.1, (now - lastT) / 1000 || 0.016); lastT = now; let animating = false;
    if (!orbDrag) {
      if (auto && now > hoverUntil && st.mode !== 'time') { angle += dt * presetOf2(st.mode).speed; target = lightFor(st.mode, angle, st.heightK); }
      const k = 1 - Math.exp(-dt * (auto ? 9 : 5)); const dx = target.x - st.light.x, dy = target.y - st.light.y, dh = target.h - st.light.h;
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dh) > 0.01) { st.light.x += dx * k; st.light.y += dy * k; st.light.h += dh * k; animating = true; }
      if (auto && st.mode !== 'time') animating = true;
    }
    { const ip = (now - intro0) / 2200; if (ip < 1 && !reduced) { st.exposure = 0.1 + 0.9 * (1 - Math.pow(1 - Math.max(0, ip), 3)); animating = true; } else if (st.exposure !== 1) { st.exposure = 1; dirty = true; } }
    if (trans) { const p = (now - trans.t0) / trans.dur; if (p >= 1) { trans = null; st.sweep = { on: false }; } else st.sweep = sweepFor(p, canvas.width / canvas.height); animating = true; }
    if (splitAnim) { const p = (now - splitAnim.t0) / splitAnim.dur; if (p >= 1) { splitAnim = null; st.split = 0.5; } else st.split = p < 0.5 ? 0.5 + 0.46 * easeInOut(p * 2) : 0.96 - 0.92 * easeInOut((p - 0.5) * 2); placeSplit(); animating = true; }
    if (camAnim) { const p = clamp01((now - camAnim.t0) / camAnim.dur), e = easeInOut(p), a = camAnim.from, b = camAnim.to; st.cam.center = [a.center[0] + (b.center[0] - a.center[0]) * e, a.center[1] + (b.center[1] - a.center[1]) * e]; st.cam.rot = a.rot + (b.rot - a.rot) * e; st.cam.tilt = a.tilt + (b.tilt - a.tilt) * e; st.cam.ppcm = a.ppcm + (b.ppcm - a.ppcm) * e; if (p >= 1) camAnim = null; syncSliders(); animating = true; }
    if (hourAnim) { const p = clamp01((now - hourAnim.t0) / hourAnim.dur); st.hour = hourAnim.from + (hourAnim.to - hourAnim.from) * (hourAnim.day ? p : easeInOut(p)); updateClock(); if (p >= 1) { if (hourAnim.day) stopDay(); hourAnim = null; } animating = true; }
    if (!dirty && !animating) return;
    resize(); try { syncSlots(); view.render(renderState(), { cssWidth: cssSize()[0], time: now / 1000 }); } catch (e) { console.error('[lab] ошибка кадра', e); say('Ошибка отрисовки: ' + e.message); }
    dirty = false; placeOrb();
    if (animating && tier !== 'fallback') {
      const ch = adaptive.push(Math.min(120, dt * 1000));
      if (ch && !lite) { view.setLevel(ch.level); level = ch.level; describePerf(); say(ch.dir === 'down' ? 'Устройству тяжело — снизил качество для плавности.' : 'Вернул часть качества.'); dirty = true; }
      else if (ch && lite) adaptive.level = Math.max(3, adaptive.level);
    }
    fpsAcc += dt; fpsN++; if (now - lastPerfText > 1500 && fpsN > 10) { root.dataset.fps = String(Math.round(fpsN / fpsAcc)); fpsAcc = 0; fpsN = 0; lastPerfText = now; }
  }
  function placeOrb() {
    const [w, h] = cssSize(), s = project(st.cam, [st.cam.center[0] + st.light.x, st.cam.center[1] + st.light.y, st.light.h], w, h);
    if (!s || s[0] < -40 || s[1] < -40 || s[0] > w + 40 || s[1] > h + 40) { orb.style.opacity = '0'; return; }
    orb.style.opacity = '1'; orb.style.transform = `translate(${s[0].toFixed(1)}px, ${s[1].toFixed(1)}px)`;
  }

  // ---- качество ------------------------------------------------------------------------------------------------------------------
  let qmode = q0; const tierLevel = () => START_LEVEL[detectTier({ webgl2: true, mobile, cores: navigator.hardwareConcurrency || 4, memory: navigator.deviceMemory || 4, renderer: pr?.renderer || '', maxTexture: pr?.maxTexture || 8192, reducedMotion: reduced, saveData: !!conn.saveData }).tier];
  const setQuality = (m, announce) => {
    qmode = m; lite = m === 'lite'; try { localStorage.setItem('lab-quality', m); } catch {}
    $$(root, '[data-q]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.q === m)));
    if (tier !== 'fallback') { level = m === 'lite' ? 3 : m === 'quality' ? 0 : tierLevel(); adaptive.level = level; adaptive.min = m === 'lite' ? 3 : 0; adaptive.max = m === 'quality' ? 0 : 4; adaptive.slow = adaptive.fast = 0; view.setLevel(level); }
    describePerf(); dirty = true; if (announce) say(m === 'lite' ? 'Лайт: меньше разрешение, без теней рельефа.' : m === 'quality' ? 'Качество: максимум, без автоснижения.' : 'Авто: качество подстраивается под устройство.');
  };
  root.addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) setQuality(b.dataset.q, true); });

  // ---- снимок, ролик, ссылка -------------------------------------------------------------------------------------------------------
  const modal = $(root, '[data-modal]'); let modalUrl = null;
  const closeModal = () => { modal.hidden = true; if (modalUrl) URL.revokeObjectURL(modalUrl); modalUrl = null; $(root, '[data-modal-media]').replaceChildren(); document.removeEventListener('keydown', modalKey); };
  const modalKey = e => { if (e.key === 'Escape') closeModal(); };
  $(root, '[data-modal-close]').addEventListener('click', closeModal);
  function showResult(kind, blob, name, note) {
    if (modalUrl) URL.revokeObjectURL(modalUrl); modalUrl = URL.createObjectURL(blob);
    const el = document.createElement(kind === 'video' ? 'video' : 'img'); el.src = modalUrl; el.className = 'lab__modal-media';
    if (kind === 'video') { el.controls = true; el.loop = true; el.muted = true; el.playsInline = true; el.autoplay = true; } else el.alt = 'Сохранённый кадр лаборатории';
    $(root, '[data-modal-media]').replaceChildren(el); $(root, '[data-modal-title]').textContent = kind === 'video' ? 'Ролик готов' : 'Изображение готово';
    const save = $(root, '[data-modal-save]'); save.href = modalUrl; save.download = name; $(root, '[data-modal-note]').textContent = note;
    const sh = $(root, '[data-modal-share]'), file = new File([blob], name, { type: blob.type });
    sh.hidden = !(navigator.canShare && navigator.canShare({ files: [file] })); sh.onclick = () => navigator.share({ files: [file], title: 'ITALON X2 — MATERIAL LAB', text: `${cur.name}, арт. ${cur.code}`, url: shareUrl() }).catch(() => {});
    modal.hidden = false; document.addEventListener('keydown', modalKey); $(root, '[data-modal-close]').focus();
  }
  const info = () => ({ collection: cur.collection, title: cur.name, code: cur.code, url: (cfg.siteUrl || 'italon-x2.ru') + cur.path });
  const composition = () => ({ view: st.view, slabs: st.slabs, code: cur.code, second: sec?.code, compare: st.compare, mode: st.mode, hour: st.hour, format: st.format, turned: st.turned, jointMm: st.jointMm, jointColor: st.jointColor, bond: st.bond, cam: st.cam });
  const shareUrl = () => `${cfg.shareBase || (location.origin + location.pathname)}#${encode(composition())}`;
  const exportLevel = () => (tier === 'fallback' ? 4 : lite ? 3 : Math.min(2, Math.max(0, level)));
  const shot = $(root, '[data-shot]'), vid = $(root, '[data-video]'), prog = $(root, '[data-progress]'), vhint = $(root, '[data-video-hint]');
  const vs = videoSupport(); vhint.textContent = vs ? `${vs.ext.toUpperCase()}, около 7 секунд` : 'Недоступно в этом браузере'; vid.disabled = !vs;
  shot.addEventListener('click', async () => {
    if (exporting) return; exporting = true; shot.disabled = true; say('Готовлю изображение…');
    try {
      const sw = st.compare ? await (secM || loadMaterial(sec)) : curM, slots = st.compare ? [sw, curM] : [curM, curM], state = renderState(); state.a = 0; state.b = st.compare ? 1 : 0; state.exposure = 1;
      const r = await exportStill({ materials: slots, state, size: EXPORT_SIZES[shareSize], info: info(), forceFallback: tier === 'fallback', level: exportLevel() });
      showResult('image', r.blob, `italon-x2-lab-${cur.code}.jpg`, 'Свет на снимке — художественная модель, цвет и рельеф даны по фото каталога. Реальный образец смотрите в салоне.'); say('');
    } catch (e) { console.error(e); say('Не удалось сохранить изображение: ' + e.message); } finally { exporting = false; shot.disabled = false; dirty = true; }
  });
  let abort = null;
  vid.addEventListener('click', async () => {
    if (abort) { abort.abort(); return; }
    if (exporting || !vs) return; exporting = true; abort = new AbortController(); vid.querySelector('b').textContent = 'Остановить запись'; shot.disabled = true; prog.hidden = false; prog.value = 0; say('Идёт запись ролика…');
    try {
      const other = await loadMaterial(st.compare ? sec : (sec.code !== cur.code ? sec : featured.find(f => f.code !== cur.code))), slots = st.compare ? [other, curM] : [curM, other];
      const base = renderState(); base.a = 0; base.b = 1; base.exposure = 1; base.sweep = { on: false };
      const r = await exportVideo({ materials: slots, state: base, size: EXPORT_SIZES[shareSize], info: info(), forceFallback: tier === 'fallback', level: Math.max(1, exportLevel()), onProgress: p => { prog.value = p; }, signal: abort.signal });
      showResult('video', r.blob, `italon-x2-lab-${cur.code}.${r.ext}`, r.ext === 'webm' ? 'Формат WebM: в Instagram и Telegram иногда нужна конвертация в MP4.' : 'Готово к публикации.'); say('');
    } catch (e) { if (!e.aborted) { console.error(e); say('Не удалось записать ролик: ' + e.message); } else say('Запись остановлена.'); }
    finally { exporting = false; abort = null; vid.querySelector('b').textContent = 'Скачать видео'; shot.disabled = false; prog.hidden = true; dirty = true; }
  });
  $(root, '[data-share-link]').addEventListener('click', async () => {
    const url = shareUrl(), hint = $(root, '[data-share-hint]');
    try { if (navigator.share) { await navigator.share({ title: 'ITALON X2 — MATERIAL LAB', text: `${cur.name}, арт. ${cur.code}`, url }); hint.textContent = 'Отправлено'; return; } } catch (e) { if (e?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); hint.textContent = 'Ссылка скопирована'; } catch { hint.textContent = url; }
    setTimeout(() => { hint.textContent = 'Ссылка на композицию'; }, 4000);
  });

  // ---- запуск ------------------------------------------------------------------------------------------------------------------------
  const ro = new ResizeObserver(() => { resize(); dirty = true; }); ro.observe(canvas);
  view.onlost = () => say('Графика была сброшена системой — восстанавливаю…'); view.onrestored = () => { say(''); slotsKey = ''; dirty = true; };
  if (qmode !== 'auto') setQuality(qmode, false); else $$(root, '[data-q]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.q === qmode)));
  renderStrip(); renderQuick(); syncSecond(); updateItem(); applyViewUi(); fitZoom(); st.light = { ...target }; syncSliders(); describePerf(); say('');
  setMode('evening'); updateClock();
  if (hash.format) { st.format = hash.format; st.turned = !!hash.turned; $$(root, '[data-format]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.format === st.format))); $(root, '[data-turn]').setAttribute('aria-pressed', String(st.turned)); }
  if (hash.jointMm !== undefined) { st.jointMm = hash.jointMm; $(root, '[data-joint]').value = hash.jointMm; $(root, '[data-joint-out]').textContent = String(hash.jointMm).replace('.', ','); }
  if (hash.jointColor) { st.jointColor = hash.jointColor; $$(root, '[data-jc]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.jc === st.jointColor))); }
  if (hash.bond) { st.bond = hash.bond; $$(root, '[data-seg="bond"]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === st.bond))); }
  if (hash.hour !== undefined) st.hour = hash.hour;
  if (hash.mode && hash.mode !== 'evening') { setMode(hash.mode, { fly: false }); if (hash.mode === 'time') updateClock(); }
  if (hash.cam && hash.mode !== 'time') Object.assign(st.cam, hash.cam);
  if (hash.view === 'slabs') {
    if (hash.slabs) st.slabs = hash.slabs; if (hash.format === undefined) { /* стена */ }
    catalogUI.ensure().then(async d => { if (hash.jointMm !== undefined) st.jointMm = hash.jointMm; const ok = await setView('slabs', { code: hash.code, second: hash.second, instant: true }); if (!ok) return; if (hash.turned !== undefined) st.turned = !!hash.turned; if (hash.jointMm !== undefined) st.jointMm = hash.jointMm; if (hash.jointColor) st.jointColor = hash.jointColor; if (hash.mode) setMode(hash.mode, { fly: false }); if (hash.hour !== undefined) { st.hour = hash.hour; updateClock(); } if (hash.cam) Object.assign(st.cam, hash.cam); applyViewUi(); if (hash.second) { const e = d.byCode.get(hash.second); if (isSlab(e)) { sec = e; await setCompare(true); } } dirty = true; }).catch(() => {});
  } else if (hash.code && !hashEntry) catalogUI.ensure().then(d => { const e = d.byCode.get(hash.code); if (e?.eligible) selectEntry(e, { animate: false }); }).catch(() => {});
  if (hash.second && hash.view !== 'slabs') catalogUI.ensure().then(async d => { const e = d.byCode.get(hash.second); if (e?.eligible) { sec = e; await setCompare(true); } }).catch(() => {});
  if (tier === 'fallback') say('Упрощённый вид: WebGL 2 недоступен, наклон и тени рельефа отключены.');
  else if (tier === 'low') say('Включён упрощённый режим: ' + (t.reason || 'слабое устройство') + '.');
  setTimeout(() => touch(), 14000); setTimeout(() => { if (status.textContent.startsWith('Включён') || status.textContent.startsWith('Упрощённый')) say(''); }, 7000);
  requestAnimationFrame(frame);
  const api = {
    lib: { tileAt, variantOf, unproject, project, basis }, st, view, get tier() { return tier; }, get level() { return view.level ?? level; }, setAuto, setMode, setHour, selectEntry, selectSecond, setCompare, resetView, renderState, resize, adaptive, canvas, catalog: catalogUI,
    get trans() { return trans; }, get cur() { return cur; }, get sec() { return sec; }, featured, setView, wallGeom, wallCam, get slabs() { return slabsCache; }, markDirty: () => { dirty = true; }, openTab, shareUrl, composition, loadMaterial, syncSlots, get loadedCount() { return matCache.size; },
  };
  root.labApi = api; return api;
}
