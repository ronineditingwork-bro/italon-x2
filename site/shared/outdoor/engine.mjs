// X2 Outdoor Lab: WebGL2-движок. Рисует фото (сцены или «Мой участок») и поверх него — плитку X2 в перспективе внутри масок зон.
// Каждая зона — отдельный проход: пиксель фото → плоскость (гомография H) → раскладка (ряды, смещение, угол, швы) → фото-текстура плитки со своим поворотом
// → свет и тени берутся из самого снимка (размытое фото / средний цвет исходной поверхности). Сравнение «до/после» и A/B — через scissor, без повторного расчёта.

const VERT = `#version 300 es
out vec2 vUv;
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = vec2(p.x, 1.0 - p.y); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uPhoto, uMask, uTile;
uniform vec2 uCanvas, uPhotoSize, uOrigin; uniform float uScale;
uniform vec4 uChan; uniform mat3 uH; uniform float uSign;
uniform vec2 uTile2; uniform float uJoint, uOffset, uAngle, uExposure, uSeed;
uniform int uJointKind, uSquare, uMode;
uniform vec3 uRef;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21) + uSeed); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
vec3 lin(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }
vec3 srgb(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
void main() {
  vec2 pp = uOrigin + vUv * uCanvas * uScale;
  vec2 uvp = pp / uPhotoSize;
  if (uvp.x < 0.0 || uvp.y < 0.0 || uvp.x > 1.0 || uvp.y > 1.0) discard;
  float mask = dot(texture(uMask, uvp), uChan);
  if (mask < 0.004 && uMode != 2) discard;
  vec3 q = uH * vec3(pp, 1.0);
  if (q.z * uSign < 1e-7) discard;
  vec2 w = q.xy / q.z;
  float ca = cos(uAngle), sa = sin(uAngle);
  vec2 wp = vec2(ca * w.x + sa * w.y, -sa * w.x + ca * w.y);
  vec2 gx = dFdx(wp), gy = dFdy(wp);
  float fw = max(0.5 * (length(gx) + length(gy)), 1e-5);
  if (uMode > 0) {                                             // сетка 1 м (и 0,5 м) для настройки перспективы
    vec2 g1 = abs(fract(w - 0.5) - 0.5), g5 = abs(fract(w * 2.0 - 0.5) - 0.5) / 2.0;
    float l1 = 1.0 - smoothstep(0.0, fw * 1.6, min(g1.x, g1.y)), l5 = (1.0 - smoothstep(0.0, fw * 1.2, min(g5.x, g5.y))) * 0.45;
    float a = clamp(max(l1, l5), 0.0, 1.0) * (uMode == 2 ? 0.9 : max(mask, 0.35) * 0.9);
    outColor = vec4(vec3(1.0, 0.82, 0.25) * a, a); return;
  }
  vec2 cs = uTile2 + uJoint;
  float row = floor(wp.y / cs.y);
  float cxf = (wp.x - uOffset * cs.x * mod(row, 2.0)) / cs.x;
  vec2 id = vec2(floor(cxf), row);
  vec2 local = vec2(fract(cxf), fract(wp.y / cs.y)) * cs;
  vec2 t = local - 0.5 * uJoint;
  float d = min(min(t.x, uTile2.x - t.x), min(t.y, uTile2.y - t.y));
  float dj = min(min(local.x, cs.x - local.x), min(local.y, cs.y - local.y));
  float irr = (uJointKind == 1 || uJointKind == 2) ? (vnoise(wp * 55.0) - 0.5) * 0.012 + (vnoise(wp * 170.0) - 0.5) * 0.006 : 0.0;
  float c1 = clamp((0.5 * uJoint - dj + irr) / fw + 0.5, 0.0, 1.0);
  float c2 = clamp(uJoint / fw, 0.0, 1.0) * clamp(1.0 - dj / fw, 0.0, 1.0);
  float jc = mix(c2, c1, smoothstep(0.6 * fw, 1.4 * fw, uJoint));
  // текстура плитки: рисунок вытянут вдоль длинной стороны, у каждой плиты свой поворот/зеркало (как у настоящих партий)
  float h = hash(id), h2 = fract(h * 13.7), h3 = fract(h * 7.31);
  vec2 tc = clamp(t, vec2(0.0), uTile2) / uTile2;
  bool longX = uTile2.x >= uTile2.y;
  vec2 uv = longX ? vec2(tc.y, tc.x) : tc;
  vec2 dux = longX ? vec2(gx.y / uTile2.y, gx.x / uTile2.x) : gx / uTile2, duy = longX ? vec2(gy.y / uTile2.y, gy.x / uTile2.x) : gy / uTile2;
  if (uSquare == 1 && h2 > 0.5) { uv = uv.yx; dux = dux.yx; duy = duy.yx; }
  if (h > 0.5) uv.x = 1.0 - uv.x;
  if (h3 > 0.5) uv.y = 1.0 - uv.y;
  vec3 tile = textureGrad(uTile, uv, dux, duy).rgb;
  tile *= 1.0 + (hash(id + 7.7) - 0.5) * 0.07;
  tile *= mix(uJointKind == 3 ? 0.78 : 0.88, 1.0, smoothstep(0.0, 0.02 + fw, d));
  vec3 avg = textureLod(uTile, vec2(0.5), 9.0).rgb;
  vec3 jcol;
  if (uJointKind == 1) { float n1 = vnoise(wp * 60.0), n2 = vnoise(wp * 210.0); jcol = mix(vec3(0.13, 0.26, 0.07), vec3(0.34, 0.50, 0.17), n1) * (0.75 + 0.5 * n2); }
  else if (uJointKind == 2) { float n = vnoise(wp * 95.0), m = vnoise(wp * 290.0); jcol = mix(vec3(0.38, 0.36, 0.33), vec3(0.74, 0.70, 0.64), n) * (0.7 + 0.55 * m); if (m < 0.28) jcol *= 0.62; }
  else if (uJointKind == 3) jcol = vec3(0.045, 0.045, 0.05);
  else jcol = avg * 0.80;
  vec3 base = mix(tile, jcol, jc);
  // свет и тени — из самого снимка: отношение размытого фото к среднему цвету исходной поверхности
  vec3 blur = textureLod(uPhoto, uvp, 2.5).rgb, fine = texture(uPhoto, uvp).rgb;
  vec3 ratio = clamp(lin(blur) / max(lin(uRef), vec3(0.01)), 0.1, 2.4);
  float lf = dot(fine, vec3(0.299, 0.587, 0.114)), lb = dot(blur, vec3(0.299, 0.587, 0.114)) + 1e-3;
  float micro = clamp(lf / lb, 0.85, 1.15);
  vec3 col = srgb(lin(base) * ratio * uExposure * mix(1.0, micro, 0.55));
  col += (hash(gl_FragCoord.xy) - 0.5) * 0.012;               // зерно, чтобы вставка не выглядела «чище» снимка
  col = clamp(col, 0.0, 1.0);
  outColor = vec4(col * mask, mask);
}`;

const PLAIN = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uPhoto; uniform vec2 uCanvas, uPhotoSize, uOrigin; uniform float uScale; uniform vec3 uBg;
void main() {
  vec2 uvp = (uOrigin + vUv * uCanvas * uScale) / uPhotoSize;
  if (uvp.x < 0.0 || uvp.y < 0.0 || uvp.x > 1.0 || uvp.y > 1.0) { outColor = vec4(uBg, 1.0); return; }
  outColor = vec4(texture(uPhoto, uvp).rgb, 1.0);
}`;

/** Вид: какая часть фото в окне. fit 'cover' (заполнить, остаток панорамируется) или 'contain' (целиком); focus — какая точка фото (0..1) стремится к центру; zoom ≥ 1. */
export function fitView(cw, ch, pw, ph, { fit = 'cover', focus = [0.5, 0.5], zoom = 1 } = {}) {
  const base = fit === 'contain' ? Math.max(pw / cw, ph / ch) : Math.min(pw / cw, ph / ch);       // фото-пикселей на пиксель окна
  const scale = base / Math.max(1, zoom);
  const vw = cw * scale, vh = ch * scale;
  const clampAxis = (center, view, full) => view >= full ? (full - view) / 2 : Math.min(full - view / 2, Math.max(view / 2, center)) - view / 2;
  return { scale, originX: clampAxis(focus[0] * pw, vw, pw), originY: clampAxis(focus[1] * ph, vh, ph), viewW: vw, viewH: vh };
}

function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
  return s;
}
function program(gl, frag) {
  const p = gl.createProgram(); gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}
const colMajor = H => new Float32Array([H[0], H[3], H[6], H[1], H[4], H[7], H[2], H[5], H[8]]);

export function createEngine(canvas) {
  let gl; try { gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }); } catch { gl = null; }
  if (!gl) return null;
  let zoneProg, plainProg;
  try { zoneProg = program(gl, FRAG); plainProg = program(gl, PLAIN); } catch (e) { console.error(e); return null; }
  const vao = gl.createVertexArray(), aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  const maxAniso = aniso ? Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) : 0;
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const state = { photo: null, pw: 1, ph: 1, mask: null, view: { originX: 0, originY: 0, scale: 1 }, zones: [[], []], compare: { mode: 'off', split: 0.5 }, exposure: 1, bg: [0.96, 0.95, 0.93], lost: false };
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); state.lost = true; });
  canvas.addEventListener('webglcontextrestored', () => { state.lost = false; state.onRestore?.(); });

  function texture(source, { mip = true, linear = true, wrap = false } = {}) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    if (aniso && mip) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, maxAniso);
    return t;
  }
  const api = {
    gl, maxTexture: maxTex,
    /** Фото сцены или участка: любой источник texImage2D (canvas, img, ImageBitmap). */
    setPhoto(source, w, h) {
      if (state.photo) gl.deleteTexture(state.photo);
      state.photo = texture(source, { mip: true }); state.pw = w; state.ph = h;
    },
    /** Маски зон: RGBA, канал = зона. data — Uint8Array w × h × 4. */
    setMasks({ data, w, h }) {
      if (state.mask) gl.deleteTexture(state.mask);
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      state.mask = t;
    },
    /** Текстура плитки из фото артикула (<img> или canvas). Возвращает объект для setZone; освобождается через dispose(). */
    createTile(source) { const tex = texture(source, { mip: true }); return { tex, dispose: () => gl.deleteTexture(tex) }; },
    /** Зона variant (0 — основной, 1 — второй вариант для A/B), index — канал маски 0..3. cfg: { H, sign, tile, params, ref, exposure, seed, mode } или null. */
    setZone(variant, index, cfg) { state.zones[variant][index] = cfg || null; },
    clearZones() { state.zones = [[], []]; },
    setView(v) { state.view = v; },
    setCompare(mode, split = 0.5) { state.compare = { mode, split }; },
    setExposure(v) { state.exposure = v; },
    setBackground(rgb) { state.bg = rgb; },
    get size() { return { w: canvas.width, h: canvas.height }; },
    resize(cssW, cssH, dpr = 1) {
      const cap = Math.min(maxTex, 4096), area = 4.2e6;
      let w = Math.max(2, Math.round(cssW * dpr)), h = Math.max(2, Math.round(cssH * dpr));
      const k = Math.min(1, cap / Math.max(w, h), Math.sqrt(area / (w * h))); w = Math.max(2, Math.round(w * k)); h = Math.max(2, Math.round(h * k));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    },
    render() {
      if (state.lost || !state.photo) return false;
      const W = canvas.width, H = canvas.height, v = state.view;
      gl.viewport(0, 0, W, H); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND); gl.bindVertexArray(vao);
      gl.useProgram(plainProg.p); const pu = plainProg.u;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, state.photo); gl.uniform1i(pu.uPhoto, 0);
      gl.uniform2f(pu.uCanvas, W, H); gl.uniform2f(pu.uPhotoSize, state.pw, state.ph); gl.uniform2f(pu.uOrigin, v.originX, v.originY); gl.uniform1f(pu.uScale, v.scale); gl.uniform3fv(pu.uBg, state.bg);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!state.mask) return true;
      // области: где какие варианты рисуются
      const c = state.compare, sx = Math.round(Math.min(1, Math.max(0, c.split)) * W);
      const regions = c.mode === 'before' ? [[sx, W - sx, 0]] : c.mode === 'ab' ? [[0, sx, 0], [sx, W - sx, 1]] : [[0, W, 0]];
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.SCISSOR_TEST);
      gl.useProgram(zoneProg.p); const u = zoneProg.u;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, state.photo); gl.uniform1i(u.uPhoto, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, state.mask); gl.uniform1i(u.uMask, 1);
      gl.uniform1i(u.uTile, 2);
      gl.uniform2f(u.uCanvas, W, H); gl.uniform2f(u.uPhotoSize, state.pw, state.ph); gl.uniform2f(u.uOrigin, v.originX, v.originY); gl.uniform1f(u.uScale, v.scale);
      for (const [x, wid, variant] of regions) {
        if (wid <= 0) continue; gl.scissor(x, 0, wid, H);
        state.zones[variant].forEach((z, i) => {
          if (!z) return;
          const chan = [0, 0, 0, 0]; chan[i] = 1; gl.uniform4fv(u.uChan, chan);
          gl.uniformMatrix3fv(u.uH, false, colMajor(z.H)); gl.uniform1f(u.uSign, z.sign || 1);
          gl.uniform1i(u.uMode, z.mode || 0);
          if (z.tile) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, z.tile.tex); }
          const p = z.params || { tileX: 1.2, tileZ: 0.6, joint: 0.003, jointKind: 0, offset: 0, angle: 0 };
          gl.uniform2f(u.uTile2, p.tileX, p.tileZ); gl.uniform1f(u.uJoint, p.joint); gl.uniform1f(u.uOffset, p.offset); gl.uniform1f(u.uAngle, p.angle);
          gl.uniform1i(u.uJointKind, p.jointKind); gl.uniform1i(u.uSquare, Math.abs(p.tileX - p.tileZ) < 1e-6 ? 1 : 0);
          gl.uniform1f(u.uExposure, (z.exposure ?? 1) * state.exposure); gl.uniform1f(u.uSeed, z.seed || 0); gl.uniform3fv(u.uRef, z.ref || [0.55, 0.55, 0.55]);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        });
      }
      gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND);
      return true;
    },
    /** Отрисовать всё фото целиком в его родном размере (не больше maxSide) и отдать canvas 2D с результатом. */
    snapshot({ maxSide = 2400, view = null } = {}) {
      const k = Math.min(1, maxSide / Math.max(state.pw, state.ph), api.maxTexture / Math.max(state.pw, state.ph));
      const w = Math.max(2, Math.round(state.pw * k)), h = Math.max(2, Math.round(state.ph * k));
      const keep = { w: canvas.width, h: canvas.height, view: state.view };
      canvas.width = w; canvas.height = h; state.view = view || { originX: 0, originY: 0, scale: state.pw / w };
      api.render();
      const out = document.createElement('canvas'); out.width = w; out.height = h; out.getContext('2d').drawImage(canvas, 0, 0);
      canvas.width = keep.w; canvas.height = keep.h; state.view = keep.view; api.render();
      return out;
    },
    dispose() { if (state.photo) gl.deleteTexture(state.photo); if (state.mask) gl.deleteTexture(state.mask); gl.getExtension('WEBGL_lose_context')?.loseContext(); },
    onRestore: null,
    get lost() { return state.lost; },
    state,
  };
  return api;
}
