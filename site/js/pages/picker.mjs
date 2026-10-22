// Подбор керамогранита: вкладки «По описанию» и «По фото». Всё считается в браузере, внешних запросов нет (кроме загрузки каталога и таблицы признаков).
//   ?q=<описание>   — открыть подбор по описанию с готовым запросом (ссылкой можно поделиться)
import { loadCatalog } from '../shop.mjs';
import { $, $$, ROOT } from '../ui.mjs';
import { productCard, esc, plural, number } from '../../shared/format.mjs';
import { searchByText, attributesOf } from '../../shared/picker-text.mjs';
import * as F from '../../shared/picker-features.mjs';
import { imageDataFrom } from '../../shared/picker-browser.mjs';

const html = document.documentElement, root = html.dataset.root || './';
const PAGE = 12;
let catalog, index, attrCache = new Map(), featCache = new Map();

// ------------------------------------------------------------------ данные
async function load() {
  catalog ||= await loadCatalog();
  index ||= fetch(new URL(`data/picker.json?v=${html.dataset.build || ''}`, ROOT), { cache: 'force-cache' })
    .then(r => { if (!r.ok) throw new Error('Данные подбора временно недоступны.'); return r.json(); });
  index = await index;
  return catalog;
}
const featOf = p => {
  const src = p.image?.src; if (!src || !index.items[src]) return null;
  if (!featCache.has(src)) featCache.set(src, F.unpack(F.fromBase64(index.items[src])));
  return featCache.get(src);
};
const attrsOf = p => {
  if (!attrCache.has(p.code)) { const f = featOf(p); attrCache.set(p.code, f ? attributesOf(p, f) : null); }
  return attrCache.get(p.code);
};
const variantsLabel = n => n > 0 ? `Ещё ${n} ${plural(n, ['формат или отделка', 'формата или отделки', 'форматов или отделок'])} этого рисунка` : '';

// ------------------------------------------------------------------ вкладки
const tabs = $$('.picker__tab');
function selectTab(tab, focus = false) {
  for (const t of tabs) { const on = t === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; $('#' + t.getAttribute('aria-controls')).hidden = !on; }
  if (focus) tab.focus();
  const url = new URL(location.href); url.hash = tab.id === 'tab-image' ? 'photo' : ''; try { history.replaceState(history.state, '', url); } catch {}
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t));
  t.addEventListener('keydown', e => { const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!k) return; e.preventDefault(); selectTab(tabs[(i + k + tabs.length) % tabs.length], true); });
});

// ------------------------------------------------------------------ вывод карточек
function resultCard(p, { why = '', score = null, more = 0 } = {}) {
  const li = document.createElement('div'); li.className = 'pick-card';
  li.innerHTML = `${productCard(p, root, { variants: 0 })}
<p class="pick-card__why">${score != null ? `<span class="pick-card__score" title="Приблизительное сходство">${score}%</span>` : ''}${why}</p>${more ? `<p class="pick-card__more">${esc(variantsLabel(more))}</p>` : ''}`;
  return li;
}

// ------------------------------------------------------------------ подбор по описанию
const form = $('#pick-text-form'), input = $('#pick-text'), clearBtn = $('#pick-text-clear');
const grid = $('#pick-text-grid'), status = $('#pick-text-status'), more = $('#pick-text-more'), understood = $('#pick-understood'), notes = $('#pick-notes');
let found = [], shown = 0, lastText = '';

function renderMore() {
  const next = found.slice(shown, shown + PAGE);
  for (const r of next) grid.append(resultCard(r.p, { why: r.reasons.length ? `<strong>Почему:</strong> ${esc(r.reasons.slice(0, 4).join(' · '))}` : '', more: r.more.length }));
  shown += next.length; more.hidden = shown >= found.length;
}
async function runText(text, { push = true } = {}) {
  text = text.trim(); lastText = text; grid.replaceChildren(); more.hidden = true; notes.hidden = true; understood.hidden = true;
  clearBtn.hidden = !text;
  if (push) { const url = new URL(location.href); if (text) url.searchParams.set('q', text); else url.searchParams.delete('q'); try { history.replaceState(history.state, '', url); } catch {} }
  if (!text) { status.textContent = ''; return; }
  status.textContent = 'Подбираю…';
  try { await load(); } catch (e) { status.textContent = e.message; return; }
  const res = searchByText(text, catalog.products, attrsOf, { limit: 96 });
  found = res.results; shown = 0;
  if (res.understood.length) { understood.hidden = false; understood.innerHTML = `<span class="picker__understood-label">Понял так:</span>${res.understood.map(x => `<span class="picker__tag">${esc(x)}</span>`).join('')}`; }
  if (res.notes.length) { notes.hidden = false; notes.textContent = res.notes.join(' '); }
  if (!found.length) {
    status.textContent = res.understood.length ? 'Под такое описание ничего не нашлось. Попробуйте убрать часть условий (например, бюджет или формат) или назвать цвет и рисунок другими словами.' : 'Не удалось понять описание. Назовите цвет, рисунок (мрамор, дерево, камень, бетон) или поверхность (глянец, мат) — например, «светло-серый под бетон, матовый».';
    return;
  }
  status.textContent = `Подобрано ${number(found.length, 0)} ${plural(found.length, ['вариант', 'варианта', 'вариантов'])}${res.relaxed ? ' (условия смягчены)' : ''}. Лучшие совпадения — сверху.`;
  renderMore();
}
form.addEventListener('submit', e => { e.preventDefault(); runText(input.value); });
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runText(input.value); } });
clearBtn.addEventListener('click', () => { input.value = ''; runText(''); input.focus(); });
more.querySelector('button').addEventListener('click', renderMore);
$$('[data-example]').forEach(b => b.addEventListener('click', () => { input.value = b.dataset.example; runText(input.value); input.focus(); }));

// ------------------------------------------------------------------ подбор по фото
const drop = $('#pick-drop'), fileInput = $('#pick-file'), editor = $('#pick-editor'), canvas = $('#pick-canvas'), frame = $('#pick-frame');
const sizeInput = $('#pick-size'), platesOnly = $('#pick-plates'), sample = $('#pick-sample'), sampleText = $('#pick-sample-text');
const imgStatus = $('#pick-image-status'), imgNotes = $('#pick-image-notes');
const simGrid = $('#pick-sim-grid'), patGrid = $('#pick-pat-grid'), simTitle = $('#pick-sim-title'), patTitle = $('#pick-pat-title');
const MAX_BYTES = 20 * 1024 * 1024, PREVIEW_W = 560;
let bitmap = null, scale = 1;                  // scale: пиксели исходника на 1 пиксель предпросмотра
let box = { x: 0, y: 0, w: 100, h: 100 };      // рамка в координатах предпросмотра
let searchTimer = 0, searchToken = 0;

async function openFile(file) {
  imgNotes.hidden = true;
  if (!file) return;
  if (!/^image\//.test(file.type)) { imgStatus.textContent = 'Это не изображение. Выберите файл JPG, PNG или WebP.'; return; }
  if (file.size > MAX_BYTES) { imgStatus.textContent = 'Файл больше 20 МБ. Уменьшите фото и попробуйте снова.'; return; }
  try { bitmap?.close?.(); bitmap = await createImageBitmap(file); } catch { imgStatus.textContent = 'Не удалось открыть изображение. Попробуйте другой файл (JPG, PNG, WebP).'; return; }
  const w = Math.min(PREVIEW_W, bitmap.width); scale = bitmap.width / w; const h = Math.round(bitmap.height / scale);
  canvas.width = w; canvas.height = h; canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  editor.hidden = false; drop.hidden = true;
  sizeInput.value = 60; setSquare(0.6, canvas.width / 2, canvas.height / 2);
  imgStatus.textContent = ''; scheduleSearch(0);
  try { await load(); } catch (e) { imgStatus.textContent = e.message; }
}
fileInput.addEventListener('change', () => openFile(fileInput.files[0]));
$('#pick-other').addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
drop.addEventListener('drop', e => openFile(e.dataTransfer?.files?.[0]));
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => { if (!drop.contains(e.target) && e.dataTransfer?.files?.length) { e.preventDefault(); selectTab($('#tab-image')); openFile(e.dataTransfer.files[0]); } });
document.addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])].find(x => /^image\//.test(x.type)); if (f) { selectTab($('#tab-image')); openFile(f); } });

function placeFrame() {
  frame.style.left = `${box.x}px`; frame.style.top = `${box.y}px`; frame.style.width = `${box.w}px`; frame.style.height = `${box.h}px`;
  const cw = canvas.clientWidth || canvas.width, k = cw / canvas.width;       // если канвас сжат стилями — пересчитываем в CSS-пиксели
  if (k !== 1) { frame.style.left = `${box.x * k}px`; frame.style.top = `${box.y * k}px`; frame.style.width = `${box.w * k}px`; frame.style.height = `${box.h * k}px`; }
}
function setSquare(frac, cx, cy) {
  const side = Math.max(24, Math.min(canvas.width, canvas.height) * frac);
  box = { x: Math.max(0, Math.min(canvas.width - side, cx - side / 2)), y: Math.max(0, Math.min(canvas.height - side, cy - side / 2)), w: side, h: side };
  placeFrame();
}
sizeInput.addEventListener('input', () => { setSquare(sizeInput.value / 100, box.x + box.w / 2, box.y + box.h / 2); scheduleSearch(120); });
$('#pick-whole').addEventListener('click', () => { box = { x: 0, y: 0, w: canvas.width, h: canvas.height }; sizeInput.value = 100; placeFrame(); scheduleSearch(0); });
platesOnly.addEventListener('change', () => scheduleSearch(0));
window.addEventListener('resize', () => bitmap && placeFrame());

// перетаскивание рамки (мышь, касание, перо) и стрелки на клавиатуре
let drag = null;
frame.addEventListener('pointerdown', e => { frame.setPointerCapture(e.pointerId); const k = canvas.width / (canvas.clientWidth || canvas.width); drag = { x: e.clientX, y: e.clientY, bx: box.x, by: box.y, k }; e.preventDefault(); });
frame.addEventListener('pointermove', e => {
  if (!drag) return;
  box.x = Math.max(0, Math.min(canvas.width - box.w, drag.bx + (e.clientX - drag.x) * drag.k));
  box.y = Math.max(0, Math.min(canvas.height - box.h, drag.by + (e.clientY - drag.y) * drag.k)); placeFrame();
});
const endDrag = () => { if (drag) { drag = null; scheduleSearch(60); } };
frame.addEventListener('pointerup', endDrag); frame.addEventListener('pointercancel', endDrag);
frame.addEventListener('keydown', e => {
  const step = (e.shiftKey ? 24 : 8), d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]; if (!d) return;
  e.preventDefault(); box.x = Math.max(0, Math.min(canvas.width - box.w, box.x + d[0])); box.y = Math.max(0, Math.min(canvas.height - box.h, box.y + d[1])); placeFrame(); scheduleSearch(120);
});

function scheduleSearch(delay) { clearTimeout(searchTimer); searchTimer = setTimeout(runImage, delay); }
async function runImage() {
  if (!bitmap) return;
  const token = ++searchToken;
  try { await load(); } catch (e) { imgStatus.textContent = e.message; return; }
  const region = { x: Math.round(box.x * scale), y: Math.round(box.y * scale), w: Math.max(8, Math.round(box.w * scale)), h: Math.max(8, Math.round(box.h * scale)) };
  const data = await imageDataFrom(bitmap, { region });
  if (token !== searchToken) return;
  const q = F.unpack(F.pack(F.describe(data)));
  // образец: что именно сравниваем
  const sctx = sample.getContext('2d'); sctx.imageSmoothingQuality = 'high'; sctx.drawImage(bitmap, region.x, region.y, region.w, region.h, 0, 0, sample.width, sample.height);
  const [L, a, b] = q.mean, family = nameColor(L, q.chroma, q.hue);
  sampleText.textContent = `Ищем: ${family}${q.tex.veins > 0.04 ? ', с прожилками' : q.tex.stdL < 1.4 ? ', ровный цвет' : ''}`;

  // кандидаты: уникальные рисунки (фото) каталога
  const groups = new Map();
  for (const p of catalog.products) {
    if (!p.image?.src || p.category === 'packaging' || (platesOnly.checked && p.category !== 'plate')) continue;
    const f = featOf(p); if (!f) continue;
    const key = `${p.collectionId}|${p.image.src}`; let g = groups.get(key);
    if (!g) { g = { p, f, more: 0 }; groups.set(key, g); } else g.more++;
  }
  const list = [...groups.values()];
  const sim = list.map(g => ({ g, d: F.distance(q, g.f) })).sort((x, y) => x.d - y.d);
  const top = sim.slice(0, PAGE), topKeys = new Set(top.map(x => `${x.g.p.collectionId}|${x.g.p.image.src}`));
  const pat = list.filter(g => !topKeys.has(`${g.p.collectionId}|${g.p.image.src}`)).map(g => ({ g, d: F.distance(q, g.f, F.PATTERN_WEIGHTS) })).sort((x, y) => x.d - y.d).slice(0, 8);
  simGrid.replaceChildren(...top.map(x => resultCard(x.g.p, { score: F.similarity(x.d), why: describeMatch(x.g.f, q), more: x.g.more })));
  patGrid.replaceChildren(...pat.map(x => resultCard(x.g.p, { why: describeMatch(x.g.f, q, true), more: x.g.more })));
  simTitle.hidden = !top.length; patTitle.hidden = !pat.length;
  imgStatus.textContent = top.length ? `Показаны ${top.length} самых похожих и ${pat.length} с похожим рисунком. Подвиньте рамку или измените её размер — подбор обновится.` : 'Ничего похожего не нашлось. Попробуйте другое фото или область.';
}
function nameColor(L, C, h) {
  const tone = L > 80 ? 'светлый' : L < 35 ? 'тёмный' : '';
  const family = C < 6 ? (L > 88 ? 'белый' : L < 22 ? 'чёрный' : 'серый') : h < 20 || h > 345 ? 'розово-красный' : h < 50 ? 'терракотовый или коричневый' : h < 105 ? (C > 18 ? 'бежево-жёлтый' : 'бежевый') : h < 200 ? 'зеленоватый' : 'сине-голубой';
  return `${tone} ${family}`.trim();
}
function describeMatch(f, q, pattern = false) {
  const out = [];
  if (!pattern) { const dE = Math.hypot((f.mean[0] - q.mean[0]) / 1.5, f.mean[1] - q.mean[1], f.mean[2] - q.mean[2]); out.push(dE < 7 ? 'очень близкий цвет' : dE < 14 ? 'близкий цвет' : 'схожая гамма'); }
  const dv = Math.abs(f.tex.veins - q.tex.veins), de = Math.abs(f.tex.edges - q.tex.edges);
  out.push(dv < 0.03 && de < 0.12 ? 'похожий рисунок' : 'схожая фактура');
  return `<strong>${pattern ? 'Рисунок:' : 'Совпало:'}</strong> ${esc(out.join(' · '))}`;
}

// ------------------------------------------------------------------ старт
const initial = new URLSearchParams(location.search).get('q');
if (initial) { input.value = initial.slice(0, 300); runText(initial, { push: false }); }
if (location.hash === '#photo') selectTab($('#tab-image'));
