// Поведение MATERIAL LAB: сцена, жесты, свет, укладка, сравнение, съёмка. Разметку даёт ui.mjs, рендер — gl.mjs (WebGL 2) или canvas2d.mjs (запасной).
import { LabGL } from './gl.mjs';
import { Canvas2DView } from './canvas2d.mjs';
import { unproject, project, panBy, zoomAt, clampTilt } from './camera.mjs';
import { FORMATS, JOINT_COLORS, jointCm } from './layout.mjs';
import { detectTier, Adaptive, LEVELS, START_LEVEL } from './perf.mjs';
import { lightAt, LIGHT_PRESETS, sweepFor, easeInOut, clamp01 } from './motion.mjs';
import { tileAt, variantOf } from './layout.mjs';
import { basis } from './camera.mjs';
import { exportStill, exportVideo, videoSupport, EXPORT_SIZES } from './export.mjs';

const $ = (r, s) => r.querySelector(s), $$ = (r, s) => [...r.querySelectorAll(s)];
const PIXEL_CAP = [2.8e6, 2.0e6, 1.2e6, 0.7e6, 0.45e6];
const HINTS = {
  day: 'Рассеянный свет из окна и далёкое солнце. Положение шара задаёт направление лучей.',
  evening: 'Тёплая лампа рядом с поверхностью: яркое пятно, быстрое затухание, мягкие тени швов.',
  side: 'Узкий луч почти вдоль поверхности: подчёркивает рельеф, блики и неровности.',
};
const TIER_TEXT = { high: 'Полное качество', medium: 'Среднее качество (мобильное устройство)', low: 'Упрощённый режим', fallback: 'Запасной режим (без WebGL 2)' };

const loadImage = src => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => rej(new Error('Не загрузилось фото ' + src)); i.src = src; });
function avgHex(img) {
  const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 8, 8);
  const d = g.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < 256; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  return [r, gg, b].map(v => Math.round(v / 64).toString(16).padStart(2, '0')).join('');
}
const cap = (el, id) => { try { el.setPointerCapture(id); } catch {} };
const download = (url, name) => { const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); };

export async function startLab(root, cfg) {
  const canvas = $(root, '[data-canvas]'), orb = $(root, '[data-orb]'), status = $(root, '[data-status]');
  const mats = cfg.materials, mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const say = t => { status.textContent = t; };
  say('Загружаю фотографии материалов…');
  const imgs = await Promise.all(mats.map(m => loadImage(m.image)));
  const sources = mats.map((m, i) => ({ source: imgs[i], photo: m.photo, surf: m.surf, avgHex: avgHex(imgs[i]) }));

  // ---- вид: WebGL 2 или запасной Canvas 2D --------------------------------------------------------------------------------
  const q0 = (() => { try { return localStorage.getItem('lab-quality') || 'auto'; } catch { return 'auto'; } })(), lite0 = q0 === 'lite';
  let view, tier, level;
  const conn = navigator.connection || {};
  const probe = () => { try { const c = document.createElement('canvas'); const g = c.getContext('webgl2'); if (!g) return null; const d = g.getExtension('WEBGL_debug_renderer_info'); const r = { renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER), maxTexture: g.getParameter(g.MAX_TEXTURE_SIZE) }; g.getExtension('WEBGL_lose_context')?.loseContext(); return r; } catch { return null; } };
  const pr = LabGL.supported() ? probe() : null;
  const t = detectTier({ webgl2: !!pr, mobile, cores: navigator.hardwareConcurrency || 4, memory: navigator.deviceMemory || 4, renderer: pr?.renderer || '', maxTexture: pr?.maxTexture || 0, reducedMotion: reduced, saveData: !!conn.saveData, forceLite: lite0 });
  tier = t.tier; level = START_LEVEL[tier];
  try {
    if (tier === 'fallback') throw new Error('no webgl');
    view = new LabGL(canvas, { level }); view.setMaterials(sources);
  } catch (e) {
    console.warn('[lab] запасной режим:', e.message); view = new Canvas2DView(canvas); view.setMaterials(sources); tier = 'fallback'; level = 4;
    $(root, '[data-tilt]')?.closest('.lab-field')?.setAttribute('hidden', '');
  }
  const adaptive = new Adaptive(level, { slowMs: 34, fastMs: 18.5, min: lite0 ? 3 : 0, max: q0 === 'quality' ? 0 : 4 });
  root.dataset.tier = tier; root.dataset.state = 'ready';

  // ---- состояние -----------------------------------------------------------------------------------------------------------
  const st = {
    a: 2, b: 0, mode: 'evening', light: { x: 40, y: 30, h: 60 }, heightK: 1,
    cam: { center: [0, 0], rot: 0, tilt: 0.62, ppcm: 4 }, format: '60x60', turned: false, jointMm: 2, jointColor: 'white', bond: 'straight',
    compare: false, split: 0.5, second: 0, tone: 0.05, sweep: { on: false }, exposure: 1,
  };
  let hoverUntil = 0, intro0 = performance.now(), angle = LIGHT_PRESETS.evening.phase, auto = !reduced, dragMode = 'move', dirty = true, lastT = 0, trans = null, splitAnim = null, touched = false, exporting = false, lite = lite0, shareSize = 'story';
  let target = { ...lightAt('evening', angle) };
  const cssSize = () => { const r = canvas.getBoundingClientRect(); return [Math.max(1, r.width), Math.max(1, r.height)]; };
  const tileDims = () => { const f = FORMATS.find(x => x.id === st.format); return st.turned ? { w: f.h, h: f.w } : { w: f.w, h: f.h }; };
  const fitZoom = () => { const [w] = cssSize(); st.cam.ppcm = Math.min(40, Math.max(1.2, w / (mobile ? 130 : 230))); };
  const resetView = () => { st.cam.center = [0, 0]; st.cam.rot = 0; st.cam.tilt = fallbackless() ? 0.62 : 0; fitZoom(); syncSliders(); dirty = true; };
  const fallbackless = () => tier !== 'fallback';
  function resize() {
    const [w, h] = cssSize(), dpr = Math.min(devicePixelRatio || 1, 2), lv = LEVELS[view.level ?? level] || LEVELS[0];
    let k = dpr * lv.scale; const cap = PIXEL_CAP[Math.min(view.level ?? level, 4)]; if (w * h * k * k > cap) k = Math.sqrt(cap / (w * h));
    const W = Math.max(2, Math.round(w * k)), H = Math.max(2, Math.round(h * k));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; dirty = true; }
  }
  function renderState() {
    const s = { ...st, tile: tileDims(), joint: jointCm(st.jointMm), light: { ...st.light } };
    const sw = { ...st.sweep };
    if (st.compare && !trans) { const aspect = canvas.width / canvas.height; Object.assign(sw, { on: true, pos: (st.split - 0.5) * aspect, dir: [1, 0], soft: 0.0015, line: true, glow: 0 }); s.a = st.second; s.b = st.a; }
    else if (trans) { s.a = trans.from; s.b = trans.to; sw.line = false; }
    else if (st.compare === false) { sw.on = false; }
    s.sweep = sw; return s;
  }

  // ---- UI -----------------------------------------------------------------------------------------------------------------
  function syncSliders() { const q = s => $(root, s); q('[data-tilt]').value = st.cam.tilt; q('[data-rot]').value = Math.max(-3.14, Math.min(3.14, st.cam.rot)); }
  function selectMat(i, animate = true) {
    if (i === st.a && !trans) return;
    const from = st.a; st.a = i; if (st.compare && st.second === i) { st.second = from; syncSecond(); }
    if (animate && !st.compare && !reduced && !exporting) trans = { from, to: i, t0: performance.now(), dur: 1500 };
    $$(root, '[data-mat]').forEach(b => { const on = +b.dataset.mat === i; b.setAttribute('aria-checked', String(on)); if (on) try { b.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); } catch {} });
    updateItem(); dirty = true; touch();
  }
  const syncSecond = () => $$(root, '[data-second]').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.second === st.second)));
  function updateItem() {
    const m = mats[st.a]; $(root, '[data-item-collection]').textContent = m.collection; $(root, '[data-item-name]').textContent = m.name;
    $(root, '[data-item-meta]').textContent = `Арт. ${m.code} · ${m.format} · ${m.finish}`; $(root, '[data-item-price]').textContent = m.priceText || '';
    const link = $(root, '[data-item-link]'); link.href = m.href; const add = $(root, '[data-item-add]');
    if (add) { add.dataset.add = m.code; add.disabled = m.canOrder === false; add.textContent = 'В корзину'; delete add.dataset.label; document.dispatchEvent(new CustomEvent('italon:cart-refresh')); }
  }
  function setMode(mode) {
    st.mode = mode; $$(root, '[data-mode]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
    $(root, '[data-mode-hint]').textContent = HINTS[mode]; angle = LIGHT_PRESETS[mode].phase; target = lightAt(mode, angle, st.heightK); dirty = true; root.dataset.mode = mode;
  }
  function touch() { if (!touched) { touched = true; root.classList.add('is-touched'); } }
  function setAuto(v) { auto = v; const b = $(root, '[data-auto]'); b.setAttribute('aria-pressed', String(v)); b.querySelector('span').textContent = v ? 'Свет движется' : 'Свет остановлен'; dirty = true; }
  const seg = (sel, attr, cb) => root.addEventListener('click', e => { const b = e.target.closest(sel); if (!b || !root.contains(b)) return; $$(b.parentElement, sel).forEach(x => x.setAttribute('aria-checked', String(x === b))); cb(b.dataset[attr], b); dirty = true; touch(); });
  seg('[data-mode]', 'mode', setMode);
  seg('[data-format]', 'format', v => { st.format = v; });
  seg('[data-jc]', 'jc', v => { st.jointColor = v; });
  seg('[data-seg="bond"]', 'value', v => { st.bond = v; });
  seg('[data-drag]', 'drag', v => { dragMode = v; });
  seg('[data-second]', 'second', v => { st.second = +v; if (st.second === st.a) { selectMat((st.a + 1) % mats.length, false); } });
  seg('[data-size]', 'size', v => { shareSize = v; });
  root.addEventListener('click', e => { const b = e.target.closest('[data-mat]'); if (b) selectMat(+b.dataset.mat); });
  $(root, '[data-turn]').addEventListener('click', e => { st.turned = !st.turned; e.currentTarget.setAttribute('aria-pressed', String(st.turned)); dirty = true; touch(); });
  $(root, '[data-auto]').addEventListener('click', () => setAuto(!auto));
  $(root, '[data-reset]').addEventListener('click', resetView);
  const onInput = (sel, fn) => $(root, sel).addEventListener('input', e => { fn(+e.target.value); dirty = true; touch(); });
  onInput('[data-joint]', v => { st.jointMm = v; $(root, '[data-joint-out]').textContent = String(v).replace('.', ','); });
  onInput('[data-height]', v => { st.heightK = v; target = lightAt(st.mode, angle, v); });
  onInput('[data-tilt]', v => { st.cam.tilt = clampTilt(v); });
  onInput('[data-rot]', v => { pivotRotate(v - st.cam.rot, cssSize()[0] / 2, cssSize()[1] / 2); });
  // вкладки и сворачивание панели
  const tabs = $$(root, '[data-tab]'), panel = $(root, '[data-panel]');
  const openTab = (id, focus) => { tabs.forEach(t => { const on = t.dataset.tab === id; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); }); $$(root, '[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== id; }); panel.classList.remove('is-folded'); $(root, '[data-fold]').setAttribute('aria-expanded', 'true'); };
  tabs.forEach(tb => { tb.tabIndex = tb.getAttribute('aria-selected') === 'true' ? 0 : -1; tb.addEventListener('click', () => { if (tb.getAttribute('aria-selected') === 'true' && mobile) { panel.classList.toggle('is-folded'); $(root, '[data-fold]').setAttribute('aria-expanded', String(!panel.classList.contains('is-folded'))); } else openTab(tb.dataset.tab); }); });
  $(root, '[data-panel] .lab__tabs').addEventListener('keydown', e => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; const i = tabs.findIndex(t => t === document.activeElement); if (i < 0) return; const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; openTab(n.dataset.tab, true); e.preventDefault(); });
  $(root, '[data-fold]').addEventListener('click', e => { panel.classList.toggle('is-folded'); e.currentTarget.setAttribute('aria-expanded', String(!panel.classList.contains('is-folded'))); });
  if (mobile) { panel.classList.add('is-folded'); $(root, '[data-fold]').setAttribute('aria-expanded', 'false'); }

  // ---- сравнение и переход ---------------------------------------------------------------------------------------------------
  const split = $(root, '[data-split]'), splitHandle = $(root, '[data-split-handle]');
  function setCompare(on) {
    st.compare = on; $(root, '[data-compare]').setAttribute('aria-pressed', String(on)); split.hidden = !on; if (on) { if (st.second === st.a) st.second = (st.a + 1) % mats.length; syncSecond(); st.split = 0.5; placeSplit(); } dirty = true; touch();
  }
  const placeSplit = () => { splitHandle.style.left = `${st.split * 100}%`; split.style.setProperty('--x', `${st.split * 100}%`); };
  $(root, '[data-compare]').addEventListener('click', () => setCompare(!st.compare));
  $(root, '[data-transition]').addEventListener('click', () => { touch(); if (st.compare) { splitAnim = { t0: performance.now(), dur: 2600, from: st.split }; dirty = true; } else selectMat((st.a + 1) % mats.length); });
  let splitDrag = false;
  splitHandle.addEventListener('pointerdown', e => { splitDrag = true; cap(splitHandle, e.pointerId); splitAnim = null; e.preventDefault(); });
  splitHandle.addEventListener('pointermove', e => { if (!splitDrag) return; const r = canvas.getBoundingClientRect(); st.split = clamp01((e.clientX - r.left) / r.width); placeSplit(); dirty = true; });
  const endSplit = () => { splitDrag = false; };
  splitHandle.addEventListener('pointerup', endSplit); splitHandle.addEventListener('pointercancel', endSplit);
  splitHandle.addEventListener('keydown', e => { const d = e.key === 'ArrowLeft' ? -0.03 : e.key === 'ArrowRight' ? 0.03 : 0; if (d) { st.split = clamp01(st.split + d); placeSplit(); dirty = true; e.preventDefault(); } });

  // ---- жесты ---------------------------------------------------------------------------------------------------------------------
  const ptrs = new Map(); let gesture = null;
  function pivotRotate(d, px, py) { const [w, h] = cssSize(), before = unproject(st.cam, px, py, w, h); st.cam.rot += d; const after = unproject(st.cam, px, py, w, h); if (before && after) st.cam.center = [st.cam.center[0] + before[0] - after[0], st.cam.center[1] + before[1] - after[1]]; syncSliders(); dirty = true; }
  const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', e => {
    cap(canvas, e.pointerId); ptrs.set(e.pointerId, pos(e)); touch(); canvas.focus({ preventScroll: true });
    gesture = { rotateBtn: e.button === 2 || e.shiftKey || e.button === 1 }; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; gesture.d = Math.hypot(a[0] - b[0], a[1] - b[1]); gesture.ang = Math.atan2(b[1] - a[1], b[0] - a[0]); }
    if (auto === true && false) setAuto(false);
  });
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') orb.style.pointerEvents = ''; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) { if (e.pointerType === 'mouse' && e.buttons === 0 && !orbDrag) { const [px, py] = pos(e); moveLightTo(px, py); hoverUntil = performance.now() + 2500; orb.style.pointerEvents = 'none'; } return; } const prev = ptrs.get(e.pointerId), cur = pos(e), [w, h] = cssSize(); ptrs.set(e.pointerId, cur);
    if (ptrs.size === 1) {
      if (dragMode === 'rotate' || gesture?.rotateBtn) { pivotRotate((cur[0] - prev[0]) * 0.006, w / 2, h / 2); st.cam.tilt = clampTilt(st.cam.tilt + (cur[1] - prev[1]) * 0.004); syncSliders(); }
      else panBy(st.cam, prev[0], prev[1], cur[0], cur[1], w, h);
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (gesture?.d) { zoomAt(st.cam, d / gesture.d, mx, my, w, h); let da = ang - gesture.ang; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; pivotRotate(da, mx, my); }
      gesture = { ...gesture, d, ang };
    }
    dirty = true;
  });
  const up = e => { ptrs.delete(e.pointerId); if (ptrs.size === 1) { const [only] = ptrs.values(); void only; } if (ptrs.size < 2 && gesture) { gesture.d = 0; } if (!ptrs.size) gesture = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); const [px, py] = pos(e), [w, h] = cssSize(); if (e.shiftKey) pivotRotate(e.deltaY * 0.002, w / 2, h / 2); else zoomAt(st.cam, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), px, py, w, h); touch(); dirty = true; }, { passive: false });
  canvas.addEventListener('keydown', e => {
    const [w, h] = cssSize(), k = e.shiftKey ? 3 : 1, step = 40 * k; let used = true;
    if (e.key === 'ArrowLeft') panBy(st.cam, w / 2, h / 2, w / 2 + step, h / 2, w, h); else if (e.key === 'ArrowRight') panBy(st.cam, w / 2, h / 2, w / 2 - step, h / 2, w, h);
    else if (e.key === 'ArrowUp') panBy(st.cam, w / 2, h / 2, w / 2, h / 2 + step, w, h); else if (e.key === 'ArrowDown') panBy(st.cam, w / 2, h / 2, w / 2, h / 2 - step, w, h);
    else if (e.key === '+' || e.key === '=') zoomAt(st.cam, 1.15, w / 2, h / 2, w, h); else if (e.key === '-' || e.key === '_') zoomAt(st.cam, 1 / 1.15, w / 2, h / 2, w, h);
    else if (e.key === 'q' || e.key === 'Q') pivotRotate(-0.08, w / 2, h / 2); else if (e.key === 'e' || e.key === 'E') pivotRotate(0.08, w / 2, h / 2);
    else if (e.key === 'PageUp') st.cam.tilt = clampTilt(st.cam.tilt + 0.06); else if (e.key === 'PageDown') st.cam.tilt = clampTilt(st.cam.tilt - 0.06);
    else used = false;
    if (used) { e.preventDefault(); syncSliders(); dirty = true; touch(); }
  });
  // «шар света»: перетаскивание по поверхности
  let orbDrag = false;
  function moveLightTo(px, py) {
    const [w, h] = cssSize(), cam = st.cam; let P = unproject(cam, px, py, w, h); if (!P) return;
    const hh = st.light.h, Q = (() => { const s = project(cam, [P[0], P[1], hh], w, h); return s ? unproject(cam, s[0], s[1], w, h) : P; })();
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
    const dt = Math.min(0.1, (now - lastT) / 1000 || 0.016); lastT = now;
    let animating = false;
    if (!orbDrag) {
      if (auto && now > hoverUntil) { angle += dt * LIGHT_PRESETS[st.mode].speed; target = lightAt(st.mode, angle, st.heightK); }
      const k = 1 - Math.exp(-dt * (auto ? 9 : 5)); const dx = target.x - st.light.x, dy = target.y - st.light.y, dh = target.h - st.light.h;
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dh) > 0.01) { st.light.x += dx * k; st.light.y += dy * k; st.light.h += dh * k; animating = true; }
      if (auto) animating = true;
    }
    { const ip = (now - intro0) / 2200; if (ip < 1 && !reduced) { st.exposure = 0.1 + 0.9 * (1 - Math.pow(1 - Math.max(0, ip), 3)); animating = true; } else if (st.exposure !== 1) { st.exposure = 1; dirty = true; }
    }
    if (trans) { const p = (now - trans.t0) / trans.dur; if (p >= 1) { trans = null; st.sweep = { on: false }; } else st.sweep = sweepFor(p, canvas.width / canvas.height); animating = true; }
    if (splitAnim) { const p = (now - splitAnim.t0) / splitAnim.dur; if (p >= 1) { splitAnim = null; st.split = 0.5; } else { st.split = p < 0.5 ? 0.5 + 0.46 * easeInOut(p * 2) : 0.96 - 0.92 * easeInOut((p - 0.5) * 2) ; if (p > 0.5) st.split = 0.96 - 0.92 * easeInOut((p - 0.5) * 2); } placeSplit(); animating = true; }
    if (!dirty && !animating) return;
    resize(); const t0 = performance.now();
    try { view.render(renderState(), { cssWidth: cssSize()[0], time: now / 1000 }); } catch (e) { console.error('[lab] ошибка кадра', e); say('Ошибка отрисовки: ' + e.message); }
    dirty = false; placeOrb();
    if (animating && tier !== 'fallback') {
      const ch = adaptive.push(Math.min(120, dt * 1000)); void t0;
      if (ch && !lite) { view.setLevel(ch.level); level = ch.level; describePerf(); say(ch.dir === 'down' ? 'Устройству тяжело — снизил качество для плавности.' : 'Вернул часть качества.'); dirty = true; }
      else if (ch && lite) { adaptive.level = Math.max(3, adaptive.level); }
    }
    fpsAcc += dt; fpsN++; if (now - lastPerfText > 1500 && fpsN > 10) { root.dataset.fps = String(Math.round(fpsN / fpsAcc)); fpsAcc = 0; fpsN = 0; lastPerfText = now; }
  }
  function placeOrb() {
    const [w, h] = cssSize(), s = project(st.cam, [st.cam.center[0] + st.light.x, st.cam.center[1] + st.light.y, st.light.h], w, h);
    if (!s || s[0] < -40 || s[1] < -40 || s[0] > w + 40 || s[1] > h + 40) { orb.style.opacity = '0'; return; }
    orb.style.opacity = '1'; orb.style.transform = `translate(${s[0].toFixed(1)}px, ${s[1].toFixed(1)}px)`;
  }

  // ---- лёгкий режим ------------------------------------------------------------------------------------------------------------------
  let qmode = q0; const tierLevel = () => START_LEVEL[detectTier({ webgl2: true, mobile, cores: navigator.hardwareConcurrency || 4, memory: navigator.deviceMemory || 4, renderer: pr?.renderer || '', maxTexture: pr?.maxTexture || 8192, reducedMotion: reduced, saveData: !!conn.saveData }).tier];
  const setQuality = (m, announce) => {
    qmode = m; lite = m === 'lite'; try { localStorage.setItem('lab-quality', m); } catch {}
    $$(root, '[data-q]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.q === m)));
    if (tier !== 'fallback') { level = m === 'lite' ? 3 : m === 'quality' ? 0 : tierLevel(); adaptive.level = level; adaptive.min = m === 'lite' ? 3 : 0; adaptive.max = m === 'quality' ? 0 : 4; adaptive.slow = adaptive.fast = 0; view.setLevel(level); }
    describePerf(); dirty = true; if (announce) say(m === 'lite' ? 'Лайт: меньше разрешение, без теней рельефа.' : m === 'quality' ? 'Качество: максимум, без автоснижения.' : 'Авто: качество подстраивается под устройство.');
  };
  root.addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) setQuality(b.dataset.q, true); });
  $$(root, '[data-q]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.q === qmode)));

  // ---- снимок и ролик ----------------------------------------------------------------------------------------------------------------
  const modal = $(root, '[data-modal]'); let modalUrl = null;
  const closeModal = () => { modal.hidden = true; if (modalUrl) URL.revokeObjectURL(modalUrl); modalUrl = null; $(root, '[data-modal-media]').replaceChildren(); document.removeEventListener('keydown', modalKey); };
  const modalKey = e => { if (e.key === 'Escape') closeModal(); };
  $(root, '[data-modal-close]').addEventListener('click', closeModal);
  function showResult(kind, blob, name, note) {
    if (modalUrl) URL.revokeObjectURL(modalUrl); modalUrl = URL.createObjectURL(blob);
    const el = document.createElement(kind === 'video' ? 'video' : 'img'); el.src = modalUrl; el.className = 'lab__modal-media';
    if (kind === 'video') { el.controls = true; el.loop = true; el.muted = true; el.playsInline = true; el.autoplay = true; } else el.alt = 'Сохранённый кадр лаборатории';
    $(root, '[data-modal-media]').replaceChildren(el); $(root, '[data-modal-title]').textContent = kind === 'video' ? 'Ролик готов' : 'Снимок готов';
    const save = $(root, '[data-modal-save]'); save.href = modalUrl; save.download = name; $(root, '[data-modal-note]').textContent = note;
    const sh = $(root, '[data-modal-share]'), file = new File([blob], name, { type: blob.type });
    sh.hidden = !(navigator.canShare && navigator.canShare({ files: [file] })); sh.onclick = () => navigator.share({ files: [file], title: 'ITALON X2 — MATERIAL LAB', text: `${mats[st.a].name}, арт. ${mats[st.a].code}`, url: mats[st.a].href }).catch(() => {});
    modal.hidden = false; document.addEventListener('keydown', modalKey); $(root, '[data-modal-close]').focus();
  }
  const info = () => { const m = mats[st.a]; return { collection: m.collection, title: m.name, code: m.code, url: (cfg.siteUrl || 'italon-x2.ru') + m.path }; };
  const baseForExport = () => { const s = renderState(); s.sweep = { on: false }; s.compare = false; if (st.compare) { s.a = st.second; s.b = st.a; } return s; };
  const exportLevel = () => (tier === 'fallback' ? 4 : lite ? 3 : Math.min(2, Math.max(0, level)));
  const shot = $(root, '[data-shot]'), vid = $(root, '[data-video]'), prog = $(root, '[data-progress]'), vhint = $(root, '[data-video-hint]');
  const vs = videoSupport(); vhint.textContent = vs ? `Ролик ≈ 7 секунд (${vs.ext.toUpperCase()}): свет описывает дугу, камера приближается, материал плавно меняется на соседний. Во время записи не сворачивайте вкладку.` : 'Запись видео из браузера здесь недоступна — сохраните снимок или запишите экран.'; vid.disabled = !vs;
  shot.addEventListener('click', async () => {
    if (exporting) return; exporting = true; shot.disabled = true; say('Готовлю снимок…');
    try { const base = baseForExport(); base.a = st.compare ? st.second : st.a; base.b = st.a; const r = await exportStill({ materials: sources, state: base, size: EXPORT_SIZES[shareSize], info: info(), forceFallback: tier === 'fallback', level: exportLevel() }); showResult('image', r.blob, `italon-x2-lab-${mats[st.a].id}.png`, 'Свет на снимке — художественная модель, цвет и рельеф даны по фото каталога. Реальный образец смотрите в салоне.'); say(''); }
    catch (e) { console.error(e); say('Не удалось сохранить снимок: ' + e.message); } finally { exporting = false; shot.disabled = false; dirty = true; }
  });
  let abort = null;
  vid.addEventListener('click', async () => {
    if (abort) { abort.abort(); return; }
    if (exporting || !vs) return; exporting = true; abort = new AbortController(); vid.textContent = 'Остановить'; shot.disabled = true; prog.hidden = false; prog.value = 0; say('Идёт запись ролика…');
    try {
      const base = baseForExport(); base.a = st.a; base.b = st.compare ? st.second : (st.a + 1) % mats.length;
      const r = await exportVideo({ materials: sources, state: base, size: EXPORT_SIZES[shareSize], info: info(), forceFallback: tier === 'fallback', level: Math.max(1, exportLevel()), onProgress: p => { prog.value = p; }, signal: abort.signal });
      showResult('video', r.blob, `italon-x2-lab-${mats[st.a].id}.${r.ext}`, r.ext === 'webm' ? 'Формат WebM: в Instagram/Telegram иногда нужна конвертация в MP4.' : 'Готово к публикации.'); say('');
    } catch (e) { if (!e.aborted) { console.error(e); say('Не удалось записать ролик: ' + e.message); } else say('Запись остановлена.'); }
    finally { exporting = false; abort = null; vid.textContent = 'Записать ролик'; shot.disabled = false; prog.hidden = true; dirty = true; }
  });

  // ---- запуск ------------------------------------------------------------------------------------------------------------------------
  const ro = new ResizeObserver(() => { resize(); dirty = true; }); ro.observe(canvas);
  view.onlost = () => say('Графика была сброшена системой — восстанавливаю…'); view.onrestored = () => { say(''); dirty = true; };
  if (qmode !== 'auto') setQuality(qmode, false);
  setMode('evening'); $$(root, '[data-mat]').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.mat === st.a))); syncSecond(); updateItem(); fitZoom(); st.light = { ...target }; syncSliders(); describePerf(); say('');
  if (tier === 'fallback') say('Упрощённый вид: WebGL 2 недоступен, наклон и тени рельефа отключены.');
  else if (tier === 'low') say('Включён упрощённый режим: ' + (t.reason || 'слабое устройство') + '.');
  setTimeout(() => touch(), 9000); setTimeout(() => { if (status.textContent.startsWith('Включён') || status.textContent.startsWith('Упрощённый')) say(''); }, 7000);
  requestAnimationFrame(frame);
  const api = { lib: { tileAt, variantOf, unproject, project, basis }, st, view, get tier() { return tier; }, get level() { return view.level ?? level; }, setAuto, setMode, selectMat, setCompare, resetView, renderState, resize, mats, adaptive, canvas, get trans() { return trans; }, markDirty: () => { dirty = true; }, openTab };
  root.labApi = api; return api;
}
