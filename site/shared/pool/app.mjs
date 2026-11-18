// Бассейн Lab: поведение страницы. Данные (сцены, варианты плитки) вшиты в страницу при сборке; корзина — window.Italon.
import { esc, money, number } from '../format.mjs';
import { ICONS } from '../outdoor/ui.mjs';
import { createEngine } from './engine.mjs';
import { ZONES, LIGHTS, LAYOUTS, GROUT, LAB_COLLECTIONS, zonesOf, optionsFor, parseHash, toHash, estimate, dims } from './model.mjs';

const FORMAT_LABEL = f => String(f).replace(/[XХ]/, ' × ');
const sizeOf = f => { const [a, b] = String(f).split(/[XХ]/).map(v => Number(v) / 100); return [Math.max(a, b), Math.min(a, b)]; };

export async function startPool(root, { scenes, options, root: siteRoot = './' }) {
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const canvas = $('[data-canvas]'), stage = $('[data-stage]'), statusEl = $('[data-status]');
  const say = (t, kind = '') => { statusEl.textContent = t; statusEl.dataset.kind = kind; };
  const toast = t => (window.Italon?.toast ? window.Italon.toast(t) : say(t));
  const engine = createEngine(canvas);
  if (!engine) { root.dataset.state = 'nogl'; say('Ваш браузер не поддерживает WebGL 2, поэтому визуализация недоступна. Откройте страницу в современном Chrome, Safari или Edge.', 'error'); return null; }
  const mobile = matchMedia('(max-width: 760px)').matches;
  const base = `${siteRoot}media/pool-lab/`;
  let S = parseHash(location.hash, scenes, options), token = 0, shown = null;
  const scene = () => scenes[S.scene], zones = () => zonesOf(scene());
  const opt = zoneId => optionsFor(options, zoneId).find(o => o.code === S[zoneId]);

  // ------------------------------------------------------------------ кадр
  function zoneTex(o, format) {
    if (o.texture) { const [l, s] = sizeOf(format); return { src: (mobile && o.texture.mobile) || o.texture.src, crop: [s / 1.2, l / 2.78] }; }  // скан слэба 120×278: каждая плита — свой участок
    return { src: o.image, crop: [1, 1] };
  }
  async function draw() {
    const my = ++token, sceneChanged = shown !== S.scene; if (sceneChanged) root.dataset.state = 'loading';
    try {
      const list = ZONES.map(z => { const o = opt(z.id); return { o, ...zoneTex(o, o.format) }; });
      const [sceneTex, ...tex] = await Promise.all([engine.loadScene(S.scene, scene(), base), ...list.map(z => engine.loadTile(z.src))]);
      if (my !== token) return;
      engine.draw({ scene: scene(), sceneTex, zones: list.map((z, i) => ({ texture: tex[i], size: sizeOf(z.o.format), crop: z.crop })),
        light: S.light, offset: S.layout === 'offset' ? 0.5 : 0, grout: GROUT.find(g => g.id === S.grout).rgb });
      stage.style.setProperty('--ol-ar', String(scene().resolution[0] / scene().resolution[1])); shown = S.scene;
      canvas.classList.remove('pl-fade'); void canvas.offsetWidth; canvas.classList.add('pl-fade');
      root.dataset.state = 'ready'; say('');
    } catch (e) { if (my === token) { root.dataset.state = 'error'; say(`Не удалось построить изображение: ${e.message}`, 'error'); } }
  }

  // ------------------------------------------------------------------ панель
  const chips = (name, items, cur, label = o => esc(o.label), extra = () => '') => items.map(o => `<button type="button" class="ol-chip" role="radio" aria-checked="${o.id === cur}" data-pick="${name}" data-value="${esc(o.id)}">${extra(o)}<span>${label(o)}</span></button>`).join('');
  function renderControls() {
    if (!zones().some(z => z.id === S.zone)) S.zone = 'deck';
    const zone = ZONES.find(z => z.id === S.zone), o = opt(zone.id), list = optionsFor(options, zone.id);
    $$('[data-scene]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scene === S.scene)));
    const lightStep = $('[data-light-step]'); lightStep.hidden = !scene().layers.pool;
    $('[data-group="light"]').innerHTML = chips('light', LIGHTS, S.light);
    $('[data-light-hint]').textContent = S.light === 'dusk' ? 'Вечерний кадр той же сцены: подсветка чаши и свет из окон.' : '';
    $('[data-zones]').innerHTML = zones().map(z => `<button type="button" class="ol-zone" role="radio" aria-checked="${z.id === S.zone}" data-zone="${z.id}"><b>${esc(z.label)}</b><small>${esc(z.note)}</small></button>`).join('');
    $('[data-stage-zones]').innerHTML = zones().map(z => `<button type="button" class="ol__chip" aria-pressed="${z.id === S.zone}" data-zone="${z.id}">${esc(z.label)}</button>`).join('');
    $('[data-material-card]').innerHTML = `<img src="${esc(o.image)}" alt="" width="72" height="72"><div><b>${esc(o.name)}</b><span>${esc(zone.note)} · ${FORMAT_LABEL(o.format)}</span><small>арт. ${esc(o.code)}${o.priceText ? ` · ${esc(o.priceText)}` : ''}</small></div>`;
    $('[data-material-groups]').innerHTML = LAB_COLLECTIONS.map(c => {
      const items = list.filter(x => x.collectionId === c); if (!items.length) return '';
      return `<p class="pl-collections__name">${esc(items[0].collection)}${zone.line === 'x2' ? ' X2' : ''}</p><div class="ol-strip" role="radiogroup" aria-label="${esc(items[0].collection)}">${items.map(x => `<button type="button" class="ol-sw" role="radio" aria-checked="${x.code === o.code}" data-option="${esc(x.code)}" title="${esc(x.name)}"><img src="${esc(x.image)}" alt="${esc(x.name)}" width="56" height="56" loading="lazy" decoding="async"></button>`).join('')}</div>`;
    }).join('');
    $('[data-group="layout"]').innerHTML = chips('layout', LAYOUTS, S.layout);
    $('[data-layout-hint]').textContent = LAYOUTS.find(l => l.id === S.layout).hint;
    $('[data-group="grout"]').innerHTML = chips('grout', GROUT, S.grout, o => esc(o.label), g => `<i class="pl-grout" style="--grout:rgb(${g.rgb.map(c => Math.round(c * 255)).join(',')})" aria-hidden="true"></i>`);
  }
  const field = (key, label, step, min, max) => `<label class="ol-sum__area"><span>${label}</span><input type="number" inputmode="decimal" min="${min}" max="${max}" step="${step}" data-dim="${key}" value="${esc(String(S[key]))}"></label>`;
  function renderSummary() {
    const ae = document.activeElement; if (ae?.matches?.('[data-dim]') && root.contains(ae)) return;   // не пересоздаём поле, пока в нём печатают
    const r = estimate(S, scene(), options), byZone = new Map(r.lines.flatMap(l => l.zones.map(z => [z, l])));
    const rows = zones().map(z => { const o = opt(z.id), area = r.areas[z.id], l = byZone.get(z.label);
      return `<li class="ol-sum__row${z.id === S.zone ? ' is-current' : ''}"><button type="button" class="ol-sum__zone" data-zone="${z.id}"><img src="${esc(o.image)}" alt="" width="44" height="44"><span><b>${esc(z.label)}</b><small>${esc(o.name)} · ${FORMAT_LABEL(o.format)} · арт. ${esc(o.code)}</small></span></button>
${z.id === 'deck' ? field('deckArea', 'Площадь, м²', 1, 0, 2000) : `<span class="ol-sum__area pl-area"><span>Площадь, м²</span><b>${number(area, 2)}</b></span>`}
<span class="ol-sum__res">${l ? `<b>${l.zones.length > 1 ? 'вместе с «' + esc(l.zones.filter(n => n !== z.label).join('», «')) + '»' : `${number(l.packs, 0)} ${esc(o.orderUnit)}`}</b><small>${l.zones.length > 1 ? `${number(l.packs, 0)} ${esc(o.orderUnit)} · ` : ''}${number(Math.round(l.covered * 100) / 100, 2)} м²${l.costKopecks != null ? ` · ≈ ${money(l.costKopecks)}` : ''}</small>` : '<small>Укажите площадь — посчитаем упаковки</small>'}</span></li>`; }).join('');
    $('[data-summary]').innerHTML = `<div class="ol-sum__head"><div><h2>Ваш расчёт</h2><p>Размеры чаши взяты со сцены — замените их своими. Площадь террасы введите сами.</p></div></div>
<div class="pl-dims">${field('length', 'Длина чаши, м', 0.1, 2, 50)}${field('width', 'Ширина чаши, м', 0.1, 1.5, 25)}${field('depth', 'Глубина, м', 0.05, 0.4, 3)}</div>
<ul class="ol-sum__list">${rows}</ul>
<div class="ol-sum__foot">
<p class="ol-sum__total">${r.lines.length ? `Итого: <b>${number(r.packs, 0)} уп.</b>${r.totalKopecks ? ` · ≈ <b>${money(r.totalKopecks)}</b>` : ''}<small>запас на подрезку учтён: 10 %; минимальный заказ — по прайсу</small>` : '<span>Введите площадь, чтобы посчитать материал.</span>'}</p>
<div class="ol-sum__actions">
<button type="button" class="ol-btn ol-btn--solid" data-request>${ICONS.cart}<span>В корзину и запросить расчёт</span></button>
<button type="button" class="ol-btn ol-btn--line" data-product="${esc(opt(S.zone).code)}"><span>Карточка материала</span></button>
<button type="button" class="ol-btn ol-btn--line" data-save>${ICONS.download}<span>Сохранить JPG</span></button>
<button type="button" class="ol-btn ol-btn--line" data-share>${ICONS.share}<span>Поделиться</span></button>
</div></div>`;
    S.lines = r.lines;
  }
  function sync(redraw = true) {
    renderControls(); renderSummary();
    try { history.replaceState(null, '', '#' + toHash(S)); } catch { /* адресную строку менять нельзя — не страшно */ }
    if (redraw) draw();
  }

  // ------------------------------------------------------------------ действия
  async function request() {
    const cart = window.Italon?.cart;
    if (!cart) { say('Корзина доступна на сайте italon-x2.ru.', 'error'); return; }
    if (!S.lines?.length) { cart.open(); toast('Введите площадь, чтобы мы положили в корзину нужное количество.'); return; }
    for (const l of S.lines) await cart.add(l.option.code, l.packs);
    cart.open();
  }
  function snapshot() {
    const h = Math.round(canvas.width * 0.05), c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height + h;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(canvas, 0, 0);
    g.fillStyle = '#111'; g.font = `${Math.round(h * 0.36)}px Inter, Arial, sans-serif`; g.textBaseline = 'middle';
    g.fillText(`ITALON X2 · Бассейн Lab · ${zones().map(z => `${z.label}: ${opt(z.id).name}`).join(' · ')} · italon-x2.ru`, h * 0.5, canvas.height + h * 0.5);
    return new Promise(res => c.toBlob(res, 'image/jpeg', 0.9));
  }
  async function save() {
    say('Готовим изображение…'); const blob = await snapshot(); if (!blob) { say('Не получилось сохранить изображение. Попробуйте ещё раз.', 'error'); return; }
    const name = `italon-x2-pool-${S.scene}.jpg`, file = new File([blob], name, { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) { try { await navigator.share({ files: [file], title: 'Italon X2 — Бассейн Lab' }); say(''); return; } catch (e) { if (e.name === 'AbortError') { say(''); return; } } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); say('Изображение сохранено.');
  }
  async function share() {
    const url = location.href;
    if (navigator.share && /iPhone|iPad|Android/i.test(navigator.userAgent)) { try { await navigator.share({ title: 'Italon X2 — Бассейн Lab', url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); } catch { window.prompt('Скопируйте ссылку', url); }
  }
  const selectZone = id => { S.zone = id; sync(false); };

  root.addEventListener('click', async e => {
    const t = e.target;
    const pick = t.closest('[data-pick]'); if (pick) { S[pick.dataset.pick] = pick.dataset.value; sync(); return; }
    const o = t.closest('[data-option]'); if (o) { S[S.zone] = o.dataset.option; sync(); return; }
    const z = t.closest('[data-zone]'); if (z) { selectZone(z.dataset.zone); return; }
    const sc = t.closest('[data-scene]'); if (sc) { if (sc.dataset.scene !== S.scene) { S = { ...S, scene: sc.dataset.scene, ...dims(scenes[sc.dataset.scene]) }; sync(); } if (sc.closest('.ol-more')) stage.scrollIntoView({ behavior: window.Italon?.reducedMotion ? 'auto' : 'smooth', block: 'start' }); return; }
    if (t.closest('[data-fullscreen]')) { const on = stage.classList.toggle('is-full'); document.body.classList.toggle('ol-lock', on); $('[data-fullscreen]').setAttribute('aria-pressed', String(on)); return; }
    if (t.closest('[data-save]')) { save(); return; }
    if (t.closest('[data-share]')) { share(); return; }
    if (t.closest('[data-request]')) { request(); return; }
    if (t === canvas) {
      const r = canvas.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / r.width * canvas.width), y = Math.floor((e.clientY - r.top) / r.height * canvas.height);
      const tex = await engine.loadScene(S.scene, scene(), base).catch(() => null), hit = tex && zones().find(zz => zz.zone === tex.zoneAt(x, y));
      if (hit) selectZone(hit.id);
    }
  });
  root.addEventListener('change', e => {
    const d = e.target.closest('[data-dim]'); if (!d) return;
    const v = Number(String(d.value).replace(',', '.'));
    if (Number.isFinite(v) && d.checkValidity() && v >= Number(d.min) && v <= Number(d.max)) S[d.dataset.dim] = v; else say(`Введите число от ${d.min} до ${d.max}.`, 'warn');
    d.blur(); sync(false);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && stage.classList.contains('is-full')) $('[data-fullscreen]').click(); });

  sync();
  return { state: () => S, draw };
}
