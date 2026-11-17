import { productMap } from './catalog.mjs';
import { LAB_COLLECTIONS, ZONES, POOL_TYPES, LIGHTS, POOL_GLOW, GROUT, LAYOUTS, OPTIONS, SCENES, parseState, stateHash, estimate } from './pool-lab-model.mjs';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (value, max = 2) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: max }).format(value);
const money = value => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value / 100);
const colorName = p => p.name.replace(/\s*60X120.*$/i, '').replace(/^(АВА|МИЛ|МАТ)\./, m => ({ 'АВА.': 'АВАНГАРД ', 'МИЛ.': 'МИЛЛЕНИУМ ', 'МАТ.': 'МАТЕРИЯ ' }[m]))
  .toLocaleLowerCase('ru-RU').replace(/(^|\s)\S/g, s => s.toLocaleUpperCase('ru-RU'));
const GROUPS = ['sun', 'pool', 'house'];
const sceneOf = () => SCENES[state.scene];
const zonesOf = () => ZONES.filter(z => sceneOf().zones.includes(z.zone));
const hasNight = () => Boolean(sceneOf().layers.pool);
let state = parseState(location.hash), openZone = 'deck', toastTimer;

function toast(text) { const t = $('#toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 4200); }

// ---------------------------------------------------------------- WebGL compositor
const canvas = $('#lab-canvas');
const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uMapU, uMapV, uBase0, uBase1, uBase2, uLight0, uLight1, uLight2, uTile1, uTile2, uTile3;
uniform vec2 uScale0, uScale1, uScale2, uSize1, uSize2, uSize3;
uniform vec3 uGain0, uGain1, uGain2, uGrout;
uniform float uOffset, uExposure, uHeight, uPhoto;
out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 fetchHdr(sampler2D s, ivec2 p, float scale) { return pow(texelFetch(s, p, 0).rgb, vec3(2.2)) * scale; }
vec3 tile(sampler2D tex, vec2 m, vec2 size) {
  float row = floor(m.y / size.y);
  m.x += uOffset * mod(row, 2.0) * size.x;
  vec2 q = m / size, cell = floor(q), f = fract(q);
  vec2 dx = dFdx(q), dy = dFdy(q);
  float lim = 0.25;  // edges of the refraction map jump; keep texture blur bounded there
  dx = clamp(dx, -lim, lim); dy = clamp(dy, -lim, lim);
  float h = hash(cell);
  if (h > 0.5) f = 1.0 - f;                        // rotate every other tile 180° to break repeats
  vec2 st = size.x > size.y ? f.yx : f;            // product photos are portrait: long side = image y
  vec2 gx = size.x > size.y ? dx.yx : dx, gy = size.x > size.y ? dy.yx : dy;
  vec3 c = textureGrad(tex, st, gx, gy).rgb * (0.97 + 0.06 * hash(cell + 7.3));
  vec2 edge = min(fract(q), 1.0 - fract(q)) * size;            // metres to the nearest joint
  vec2 px = max(vec2(length(vec2(dFdx(m.x), dFdy(m.x))), length(vec2(dFdx(m.y), dFdy(m.y)))), vec2(1e-4));
  px = min(px, vec2(0.05));
  float w = 0.003;                                              // 3 mm joint
  vec2 cov = clamp((w * 0.5 + px * 0.5 - edge) / px, 0.0, 1.0) * min(vec2(1.0), w / px);
  return mix(c, uGrout, max(cov.x, cov.y));
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.x, uHeight - 1.0 - gl_FragCoord.y);
  vec3 a = texelFetch(uMapU, p, 0).rgb, b = texelFetch(uMapV, p, 0).rgb;
  int zone = int(round(a.b * 255.0 / 80.0));
  vec2 m = vec2(round(a.r * 255.0) * 256.0 + round(a.g * 255.0), round(b.r * 255.0) * 256.0 + round(b.g * 255.0)) / 1000.0;
  vec3 albedo = zone == 1 ? tile(uTile1, m, uSize1) : zone == 2 ? tile(uTile2, m, uSize2) : zone == 3 ? tile(uTile3, m, uSize3) : vec3(0.0);
  vec3 col = uGain0 * (fetchHdr(uBase0, p, uScale0.x) + albedo * fetchHdr(uLight0, p, uScale0.y))
           + uGain1 * (fetchHdr(uBase1, p, uScale1.x) + albedo * fetchHdr(uLight1, p, uScale1.y))
           + uGain2 * (fetchHdr(uBase2, p, uScale2.x) + albedo * fetchHdr(uLight2, p, uScale2.y));
  vec3 x = col * uExposure;
  // photo scenes are already graded; renders need a filmic curve
  x = uPhoto > 0.5 ? clamp(x, 0.0, 1.0) : clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  outColor = vec4(mix(12.92 * x, 1.055 * pow(x, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, x)), 1.0);
}`;
let program, uniforms = {};
function setupGl() {
  const compile = (type, source) => {
    const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0,1);}'));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  for (let i = 0, c = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i < c; i++) {
    const name = gl.getActiveUniform(program, i).name; uniforms[name] = gl.getUniformLocation(program, name);
  }
  ['uMapU', 'uMapV', 'uBase0', 'uBase1', 'uBase2', 'uLight0', 'uLight1', 'uLight2', 'uTile1', 'uTile2', 'uTile3']
    .forEach((name, unit) => gl.uniform1i(uniforms[name], unit));
}
const loadImage = src => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error(`Не удалось загрузить ${src}`)); i.src = src; });
function texture(image, srgb) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
  if (srgb) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
  } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, srgb ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
const variants = {}, tiles = {};
let black;
function loadVariant(name) {
  return variants[name] ??= (async () => {
    const [W, H] = SCENES[name].resolution, layers = SCENES[name].layers;
    const names = ['u', 'v', ...GROUPS.map(g => `${g}-base`), ...GROUPS.map(g => `${g}-light`)];
    const images = await Promise.all(names.map(file => layers[file.split('-')[0]] || file.length === 1
      ? loadImage(`/media/pool-lab/${name}-${file}.${file.length === 1 ? 'png' : 'webp'}`) : null));
    const zones = document.createElement('canvas'); zones.width = W; zones.height = H;
    const ctx = zones.getContext('2d', { willReadFrequently: true }); ctx.drawImage(images[0], 0, 0);
    const pixels = ctx.getImageData(0, 0, W, H).data;
    black ??= (() => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); return t; })();
    return { textures: images.map(i => i ? texture(i, false) : black), zoneAt: (x, y) => Math.round(pixels[(y * W + x) * 4 + 2] / 80) };
  })().catch(e => { delete variants[name]; throw e; });
}
function loadTile(code) {
  return tiles[code] ??= loadImage(productMap.get(code).image.src).then(i => texture(i, true)).catch(e => { delete tiles[code]; throw e; });
}
const GAINS = {
  day: { exposure: 0.6, sun: [1, 1, 1], pool: 0, house: 0 },
  dusk: { exposure: 0.8, sun: [0.42, 0.27, 0.17], pool: 0.55, house: 0.75 },
  night: { exposure: 1.0, sun: [0.012, 0.016, 0.03], pool: 1, house: 1 },
};
let drawToken = 0;
async function draw() {
  const token = ++drawToken;
  $('#lab-stage').classList.add('loading');
  try {
    const [variant, ...zoneTextures] = await Promise.all([loadVariant(state.scene), ...ZONES.map(z => loadTile(state[z.id]))]);
    if (token !== drawToken) return;
    variant.textures.forEach((t, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); });
    zoneTextures.forEach((t, i) => { gl.activeTexture(gl.TEXTURE8 + i); gl.bindTexture(gl.TEXTURE_2D, t); });
    const { layers, resolution: [W, H], kind } = sceneOf(), glow = POOL_GLOW[state.glow].rgb;
    // photo scenes: the 'pool' slot holds the evening shot, shown as is
    const g = kind === 'photo' ? (state.light === 'day' || !hasNight() ? GAINS.day : { sun: [0, 0, 0], pool: 1, house: 0 }) : GAINS[hasNight() ? state.light : 'day'];
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; $('#lab-stage').style.aspectRatio = `${W} / ${H}`; }
    GROUPS.forEach((group, i) => {
      gl.uniform2f(uniforms[`uScale${i}`], layers[group]?.base ?? 0, layers[group]?.light ?? 0);
      const gain = group === 'sun' ? g.sun : group === 'pool' ? (kind === 'photo' ? [g.pool, g.pool, g.pool] : glow.map(c => c * g.pool)) : [g.house, g.house * 0.97, g.house * 0.92];
      gl.uniform3fv(uniforms[`uGain${i}`], gain);
    });
    ZONES.forEach((z, i) => {
      const [a, b] = productMap.get(state[z.id]).format.split(/[XХ]/).map(v => Number(v) / 100);
      gl.uniform2f(uniforms[`uSize${i + 1}`], Math.max(a, b), Math.min(a, b));  // long side along the u axis
    });
    gl.uniform3fv(uniforms.uGrout, GROUT[state.grout].rgb.map(c => c ** 2.2));
    gl.uniform1f(uniforms.uOffset, state.layout === 'offset' ? 0.5 : 0);
    gl.uniform1f(uniforms.uExposure, kind === 'photo' ? 1 : g.exposure);
    gl.uniform1f(uniforms.uPhoto, kind === 'photo' ? 1 : 0);
    gl.uniform1f(uniforms.uHeight, H);
    gl.viewport(0, 0, W, H); gl.drawArrays(gl.TRIANGLES, 0, 3);
    $('#lab-stage').classList.remove('loading', 'failed');
  } catch (e) {
    if (token !== drawToken) return;
    $('#lab-stage').classList.remove('loading'); $('#lab-stage').classList.add('failed');
    $('#lab-error').textContent = e.message || 'Не удалось построить изображение.';
  }
}

// ---------------------------------------------------------------- panel
const swatch = (zone, p) => `<button type="button" class="lab-swatch${state[zone] === p.code ? ' active' : ''}" data-zone="${zone}" data-code="${p.code}" aria-pressed="${state[zone] === p.code}" title="${esc(p.name)}"><img src="${esc(p.image.src)}" alt="" width="${p.image.width}" height="${p.image.height}" loading="lazy"><span>${esc(colorName(p))}</span></button>`;
const choice = (key, value, label, extra = '') => `<button type="button" class="lab-choice${state[key] === value ? ' active' : ''}" data-key="${key}" data-value="${value}" aria-pressed="${state[key] === value}">${extra}${esc(label)}</button>`;
function renderPanel() {
  const zones = zonesOf();
  if (!zones.some(z => z.id === openZone)) openZone = 'deck';
  $('#lab-hotspots').innerHTML = zones.map(z => `<button type="button" class="lab-hotspot${z.id === openZone ? ' active' : ''}" data-open="${z.id}" style="left:${sceneOf().hotspots[z.id][0] * 100}%;top:${sceneOf().hotspots[z.id][1] * 100}%">${esc(z.label)}</button>`).join('');
  $('#lab-panel').innerHTML = `
  <div class="lab-group"><h2 class="lab-label">Сцена</h2><div class="lab-scenes">${Object.entries(SCENES).map(([id, sc]) => `<button type="button" class="lab-scene${state.scene === id ? ' active' : ''}" data-key="scene" data-value="${id}" aria-pressed="${state.scene === id}"><img src="/media/pool-lab/${id}-thumb.webp" alt="" width="480" height="${Math.round(480 * sc.resolution[1] / sc.resolution[0])}" loading="lazy"><span>${esc(sc.label)}<small>${esc(POOL_TYPES[sc.pool.type])}</small></span></button>`).join('')}</div></div>
  ${hasNight() ? `<div class="lab-group"><h2 class="lab-label">Время суток</h2><div class="lab-segment">${Object.entries(LIGHTS).filter(([k]) => sceneOf().kind !== 'photo' || k !== 'night').map(([k, l]) => choice('light', k, l)).join('')}</div>
    ${state.light === 'day' || sceneOf().kind === 'photo' ? '' : `<p class="lab-sub">Подсветка чаши</p><div class="lab-glow">${Object.entries(POOL_GLOW).map(([k, v]) => `<button type="button" class="lab-dot${state.glow === k ? ' active' : ''}" data-key="glow" data-value="${k}" aria-pressed="${state.glow === k}" title="${esc(v.label)}" style="--dot:rgb(${v.rgb.map(c => Math.round(c * 255)).join(',')})"><span class="sr-only">${esc(v.label)}</span></button>`).join('')}</div>`}</div>` : ''}
  ${zones.map(z => {
    const p = productMap.get(state[z.id]); const open = openZone === z.id;
    const collection = OPTIONS[z.id].find(o => o.code === state[z.id]).labCollection;
    return `<div class="lab-zone${open ? ' open' : ''}"><button type="button" class="lab-zone-head" data-open="${z.id}" aria-expanded="${open}"><img src="${esc(p.image.src)}" alt="" width="${p.image.width}" height="${p.image.height}"><span><strong>${esc(z.label)}</strong><small>${esc(colorName(p))} · ${esc(z.note)}</small></span></button>
      ${open ? `<div class="lab-zone-body">${LAB_COLLECTIONS.map(c => `<p class="lab-sub">${esc(c.label)}</p><div class="lab-swatches">${OPTIONS[z.id].filter(o => o.labCollection === c.id).map(o => swatch(z.id, o)).join('')}</div>`).join('')}<p class="lab-hint">Сейчас: ${esc(LAB_COLLECTIONS.find(c => c.id === collection).label)}, ${esc(p.format.replace(/[XХ]/, ' × '))} см</p></div>` : ''}</div>`;
  }).join('')}
  <div class="lab-group"><h2 class="lab-label">Укладка</h2><div class="lab-segment">${Object.entries(LAYOUTS).map(([k, l]) => choice('layout', k, l)).join('')}</div>
    <p class="lab-sub">Затирка</p><div class="lab-segment">${Object.entries(GROUT).map(([k, v]) => choice('grout', k, v.label, `<i class="lab-chip" style="--dot:rgb(${v.rgb.map(c => Math.round(c * 255)).join(',')})"></i>`)).join('')}</div></div>`;
}
function renderEstimate() {
  for (const key of ['length', 'width', 'depth', 'deckArea', 'reserve']) { const el = $(`#lab-${key}`); if (document.activeElement !== el) el.value = state[key]; }
  try {
    const result = estimate(state);
    $('#lab-areas').innerHTML = ZONES.filter(z => result.areas[z.id]).map(z => `<div><dt>${esc(z.label)}</dt><dd>${n(result.areas[z.id])} м²</dd></div>`).join('');
    $('#lab-lines').innerHTML = result.lines.map(l => `<tr><td><img src="${esc(l.product.image.src)}" alt="" width="34" height="68"><span><strong>${esc(l.product.name)}</strong><small>${esc(l.zones.join(' + '))} · ${l.product.code}</small></span></td><td>${n(l.target)} м²</td><td>${n(l.packs, 0)} ${esc(l.product.orderUnit)}${l.minimumApplied ? '<small>минимум по прайсу</small>' : ''}</td><td>${money(l.totalKopecks)}</td></tr>`).join('');
    $('#lab-total').textContent = money(result.totalKopecks);
    $('#lab-calc-error').hidden = true; $('#lab-add').disabled = false;
    return result;
  } catch (e) {
    $('#lab-calc-error').hidden = false; $('#lab-calc-error').textContent = e.message; $('#lab-add').disabled = true;
  }
}
function update(changes, redraw = true) {
  state = { ...state, ...changes };
  history.replaceState(null, '', '#' + stateHash(state));
  renderPanel(); renderEstimate(); if (redraw) draw();
}

// ---------------------------------------------------------------- actions
async function addToCart() {
  const result = renderEstimate(); if (!result) return;
  const button = $('#lab-add'); button.disabled = true;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const current = await fetch('/api/cart', { credentials: 'same-origin', cache: 'no-store' });
      const cart = await current.json(); if (!current.ok) throw new Error(cart.error || 'Корзина недоступна.');
      const items = cart.lines.map(({ code, packs }) => ({ code, packs }));
      for (const line of result.lines) { const old = items.find(i => i.code === line.code); if (old) old.packs += line.packs; else items.push({ code: line.code, packs: line.packs }); }
      const saved = await fetch('/api/cart', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: cart.version, items }) });
      const data = await saved.json();
      if (saved.ok) { toast('Расчёт добавлен в корзину. Откройте её, чтобы скачать КП в PDF.'); $('#lab-cart-link').hidden = false; return; }
      if (saved.status !== 409) throw new Error(data.error || 'Не удалось сохранить корзину.');
    }
    throw new Error('Корзина изменилась в другой вкладке. Повторите попытку.');
  } catch (e) { toast(e.message || 'Нет связи с корзиной. Повторите попытку.'); }
  finally { button.disabled = false; }
}
function downloadImage() {
  const { width: W, height: H } = canvas;
  const out = document.createElement('canvas'); out.width = W; out.height = H + 120;
  const c = out.getContext('2d'); c.fillStyle = '#f3f1eb'; c.fillRect(0, 0, out.width, out.height); c.drawImage(canvas, 0, 0);
  c.fillStyle = '#2e382c'; c.font = '500 26px Jost, Arial'; c.fillText('ITALON X2 · Бассейн Lab', 40, H + 50);
  c.font = '18px Inter, Arial'; c.fillStyle = '#626b5c';
  c.fillText(zonesOf().map(z => `${z.label}: ${productMap.get(state[z.id]).name}`).join('   ·   '), 40, H + 88);
  out.toBlob(blob => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'italon-bassein-lab.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }, 'image/png');
}
async function share() {
  const url = location.href;
  try { if (navigator.share) await navigator.share({ title: 'Бассейн Lab · Italon X2', url }); else { await navigator.clipboard.writeText(url); toast('Ссылка на вариант скопирована.'); } }
  catch (e) { if (e.name !== 'AbortError') toast('Скопируйте ссылку из адресной строки.'); }
}

// ---------------------------------------------------------------- wiring
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.code) update({ [t.dataset.zone]: t.dataset.code });
  else if (t.dataset.key === 'scene') { const { length, width, depth } = SCENES[t.dataset.value].pool; update({ scene: t.dataset.value, length, width, depth }); }
  else if (t.dataset.key) update({ [t.dataset.key]: t.dataset.value }, true);
  else if (t.dataset.open) { openZone = openZone === t.dataset.open && t.closest('#lab-panel') ? '' : t.dataset.open; renderPanel(); if (!t.closest('#lab-panel')) $('#lab-panel .lab-zone.open')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
});
canvas.addEventListener('click', async e => {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / r.width * canvas.width), y = Math.floor((e.clientY - r.top) / r.height * canvas.height);
  const variant = await variants[state.scene]?.catch(() => null);
  const zone = variant && zonesOf().find(z => z.zone === variant.zoneAt(x, y));
  if (zone) { openZone = zone.id; renderPanel(); $('#lab-panel .lab-zone.open')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
});
$('#lab-form').addEventListener('input', e => {
  const key = e.target.id.replace('lab-', ''), value = Number(e.target.value);
  if (key in state && Number.isFinite(value) && e.target.checkValidity()) update({ [key]: value }, false);
});
$('#lab-add').addEventListener('click', addToCart);
$('#lab-download').addEventListener('click', downloadImage);
$('#lab-share').addEventListener('click', share);
$('#lab-retry').addEventListener('click', draw);

if (!gl) { $('#lab-stage').classList.add('failed'); $('#lab-error').textContent = 'Браузер не поддерживает WebGL 2. Откройте страницу в современном Chrome, Safari, Firefox или Edge.'; }
else { setupGl(); draw(); }
renderPanel(); renderEstimate();
