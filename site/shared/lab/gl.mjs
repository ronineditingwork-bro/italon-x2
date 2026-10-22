// WebGL 2: поверхность из плитки по фотографиям каталога, освещённая управляемым светом.
// ЧЕСТНО О МОДЕЛИ: это художественная модель освещения. Цвет берётся с фотографии изделия (снимок уже содержит свет студии), рельеф вычислен из её светлоты
// (настоящего рельефа на фото нет), блеск задан по типу отделки в каталоге; мелкая зернистость дорисована программно. Метод — отражение Кука—Торренса (GGX) с картой нормалей,
// приближённые тени рельефа и условное окружение. Это НЕ физически точное воспроизведение материала: оттенок и фактура в жизни отличаются, образцы — в салоне.
import { basis, DIST } from './camera.mjs';
import { buildNormalMap, averageColor } from './maps.mjs';
import { JOINT_COLORS, BONDS, HASH_OFFSET } from './layout.mjs';
import { LEVELS } from './perf.mjs';

const VERT = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float; precision highp int; precision highp sampler2DArray;
uniform vec2 uRes; uniform vec3 uEye, uF, uR, uU; uniform float uFpx;
uniform vec2 uTile; uniform float uJoint; uniform int uBond; uniform vec3 uJointRGB; uniform float uJointTone;
uniform float uLayer[2]; uniform vec2 uPhoto[2]; uniform vec4 uSurf[2]; uniform vec3 uAvg[2];
uniform int uSweepOn; uniform float uSweepPos; uniform vec2 uSweepDir; uniform float uSweepSoft; uniform float uSweepLine; uniform float uSweepGlow;
uniform int uMode; uniform vec3 uLight; uniform vec2 uCenter; uniform float uExposure; uniform float uTime;
uniform int uQ; uniform int uDebug; uniform float uTone; uniform float uAspect;
uniform sampler2DArray uAlbedo; uniform sampler2DArray uNormal;
out vec4 outColor;

const float PI = 3.14159265;
const int OFF = ${HASH_OFFSET};

uint ihash(int col, int row) {
  uint h = uint(col) * 374761393u + uint(row) * 668265263u;
  h = (h ^ (h >> 13)) * 1274126177u;
  h = h ^ (h >> 16);
  return h;
}
float hash2(int col, int row) { return float(ihash(col, row) & 16777215u) / 16777216.0; }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
float mirror1(float t) { float m = mod(t, 2.0); return m > 1.0 ? 2.0 - m : m; }
vec2 mirror2(vec2 t) { return vec2(mirror1(t.x), mirror1(t.y)); }
float rowShift(int row) { int r = row; if (uBond == 1) return float(((r % 2) + 2) % 2) * 0.5; if (uBond == 2) return float(((r % 3) + 3) % 3) / 3.0; return 0.0; }

struct Tile { int col; int row; vec2 l; bool inside; float edge; vec2 outDir; };
Tile tileAt(vec2 p) {
  Tile t; float px = uTile.x + uJoint, py = uTile.y + uJoint;
  t.row = int(floor(p.y / py));
  float xs = p.x - rowShift(t.row) * px;
  t.col = int(floor(xs / px));
  t.l = vec2(xs - float(t.col) * px - uJoint * 0.5, p.y - float(t.row) * py - uJoint * 0.5);
  t.inside = t.l.x >= 0.0 && t.l.x <= uTile.x && t.l.y >= 0.0 && t.l.y <= uTile.y;
  float dl = t.l.x, dr = uTile.x - t.l.x, db = t.l.y, dt = uTile.y - t.l.y;
  float m = min(min(dl, dr), min(db, dt));
  t.edge = t.inside ? m : -max(max(max(-t.l.x, t.l.x - uTile.x), max(-t.l.y, t.l.y - uTile.y)), 0.0);
  t.outDir = m == dl ? vec2(-1.0, 0.0) : m == dr ? vec2(1.0, 0.0) : m == db ? vec2(0.0, -1.0) : vec2(0.0, 1.0);
  return t;
}

vec3 acesFilm(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

// ---- освещение по режимам -------------------------------------------------------------------------------------------------------
struct Lit { vec3 L; vec3 color; vec3 amb; float shadowK; float envK; };
Lit lighting(vec3 P) {
  Lit o; vec3 lp = uLight;
  if (uMode == 0) {            // дневной: мягкое небо + далёкое солнце, направление — от центра кадра к «шару света»
    vec3 d = vec3(lp.xy - uCenter, max(lp.z, 8.0) * 2.4); o.L = normalize(d);
    o.color = vec3(1.0, 0.955, 0.87) * 1.7; o.amb = vec3(0.50, 0.58, 0.70) * 0.34; o.shadowK = 0.55; o.envK = 1.0;
  } else if (uMode == 1) {     // вечерний: тёплая лампа рядом, быстрое затухание, тёмный синий фон
    vec3 d = lp - P; float r = length(d); o.L = d / r;
    float att = 1.0 / (1.0 + pow(r / 85.0, 2.0)); o.color = vec3(1.0, 0.60, 0.30) * 3.6 * att * (1.0 + 0.04 * sin(uTime * 7.0 + r * 0.03));
    o.amb = vec3(0.16, 0.19, 0.30) * 0.30; o.shadowK = 0.8; o.envK = 0.5;
  } else {                     // боковой направленный: скользящий луч, подчёркивает рельеф
    vec2 h = lp.xy - uCenter; float el = mix(0.07, 0.42, clamp((lp.z - 8.0) / 110.0, 0.0, 1.0));
    vec3 d = vec3(normalize(h + 1e-4) * cos(el), sin(el)); o.L = normalize(d);
    o.color = vec3(0.96, 0.975, 1.0) * 3.6; o.amb = vec3(0.045, 0.05, 0.06); o.shadowK = 1.0; o.envK = 0.25;
  }
  return o;
}

// ---- один материал в одной точке ---------------------------------------------------------------------------------------------------
vec3 shadeMat(int m, vec3 P, vec3 V) {
  Tile t = tileAt(P.xy);
  vec4 S = uSurf[m]; float layer = uLayer[m]; vec2 ph = uPhoto[m];
  vec3 N = vec3(0.0, 0.0, 1.0); vec3 albedo; float rough = S.x; float relief = S.y; float h0 = 0.0; float jointK = 0.0;
  vec2 duvdp = vec2(0.0); vec2 uv = vec2(0.5); float specK = 1.0;
  Lit Li = lighting(P);
  if (t.inside) {
    int c = t.col + OFF, r = t.row + OFF;
    float a = hash2(c, r), b = hash2(c + 7919, r + 104729), cc = hash2(r * 31 + 5, c * 17 + 3), dd = hash2(c ^ 23505, r ^ 112755);
    bool fx = a > 0.5, fy = b > 0.5;
    vec2 tuv = vec2(t.l.x / uTile.x, t.l.y / uTile.y);
    if (fx) tuv.x = 1.0 - tuv.x; if (fy) tuv.y = 1.0 - tuv.y;
    vec2 sw = vec2(uTile.x / ph.x, uTile.y / ph.y);
    vec2 off = vec2(sw.x < 1.0 ? cc * (1.0 - sw.x) : 0.0, sw.y < 1.0 ? dd * (1.0 - sw.y) : 0.0);
    vec2 puv = off + tuv * sw;                         // «координаты в фото» с учётом физического размера
    uv = vec2(mirror1(puv.x), 1.0 - mirror1(puv.y));   // v вверх по плитке → вверх по фото
    duvdp = vec2((fx ? -1.0 : 1.0) * sw.x / uTile.x, -(fy ? -1.0 : 1.0) * sw.y / uTile.y);
    albedo = texture(uAlbedo, vec3(uv, layer)).rgb;
    albedo *= 1.0 + (a - 0.5) * uTone;                // лёгкая разница тона между плитками одной партии
    vec3 nm = texture(uNormal, vec3(uv, layer)).rgb * 2.0 - 1.0; vec2 nxy = nm.xy; if (fx) nxy.x = -nxy.x; if (fy) nxy.y = -nxy.y;
    float ns = clamp(relief / 0.07, 0.0, 3.2);
    nxy *= ns;
    if (uQ < 2) { vec2 mp = P.xy * 9.0; nxy += (vec2(vnoise(mp), vnoise(mp + 17.3)) - 0.5) * 2.0 * S.z; }
    float bev = 1.0 - smoothstep(0.0, 0.16, t.edge);   // фаска ректифицированной кромки
    nxy += t.outDir * bev * 0.55;
    N = normalize(vec3(nxy, 1.0));
    h0 = texture(uNormal, vec3(uv, layer)).a * relief;
    albedo *= mix(1.0, 0.82, bev * 0.6);
    specK = mix(1.0, 0.0, 0.0);
  } else {
    // шов: ниже плитки, мельче шероховатость, цвет по выбору
    jointK = 1.0; vec3 jc = mix(uJointRGB, uAvg[m] * 0.85, uJointTone);
    albedo = jc * (0.92 + 0.16 * vnoise(P.xy * 14.0)); rough = 0.92; relief = 0.0; h0 = -0.22;
    N = normalize(vec3((vec2(vnoise(P.xy * 11.0), vnoise(P.xy * 11.0 + 9.0)) - 0.5) * 0.35, 1.0));
    specK = 0.35;
  }
  vec3 L = Li.L; float NL = max(dot(N, L), 0.0), NV = max(dot(N, V), 1e-3);
  // приближённые тени рельефа и шва: шагаем по лучу к свету по карте высот
  float sh = 1.0;
  if (L.z > 0.015) {
    if (jointK > 0.5) {
      float depth = 0.22 + 0.06; float w = max(uJoint, 0.02);
      float k = clamp(L.z / max(length(L.xy), 1e-3), 0.0, 4.0);    // tan возвышения
      sh = mix(0.45, 1.0, clamp(k * w / depth * 0.9, 0.0, 1.0));
    } else if (uQ == 0 && relief > 0.004) {
      float horiz = length(L.xy) + 1e-4; vec2 dir2 = L.xy / horiz; float slope = L.z / horiz;
      float maxD = clamp(relief * 10.0, 0.15, 1.6);
      for (int i = 1; i <= 6; i++) {
        float dist = maxD * float(i) / 6.0; vec2 q = P.xy + dir2 * dist;
        vec2 uv2 = vec2(mirror1(0.0 + uv.x + dir2.x * dist * duvdp.x), mirror1(uv.y + dir2.y * dist * duvdp.y));
        float hs = texture(uNormal, vec3(uv2, layer)).a * relief; float rayH = h0 + slope * dist;
        sh = min(sh, 1.0 - clamp((hs - rayH) / (0.03 + relief * 0.12), 0.0, 1.0) * Li.shadowK);
      }
    }
  } else sh = 0.0;
  vec3 H = normalize(L + V); float NH = max(dot(N, H), 0.0), VH = max(dot(V, H), 0.0);
  float al = max(rough * rough, 0.012); float a2 = al * al;
  float D = a2 / (PI * pow(NH * NH * (a2 - 1.0) + 1.0, 2.0));
  float kk = (rough + 1.0) * (rough + 1.0) / 8.0; float G = (NL / (NL * (1.0 - kk) + kk)) * (NV / (NV * (1.0 - kk) + kk));
  float F0 = S.w; float F = F0 + (1.0 - F0) * pow(1.0 - VH, 5.0);
  vec3 spec = Li.color * (D * G * F / max(4.0 * NL * NV, 1e-3)) * NL * sh * specK;
  vec3 diff = albedo * Li.color * NL * sh * (1.0 - F0);
  float ao = jointK > 0.5 ? 0.78 : mix(0.82, 1.0, smoothstep(0.0, 0.35, t.edge));
  if (relief > 0.004) ao *= mix(0.78, 1.0, clamp(h0 / relief, 0.0, 1.0));
  vec3 amb = albedo * Li.amb * ao;
  vec3 env = vec3(0.0);
  if (uQ < 2) {
    vec3 R = reflect(-V, N); float fe = F0 + (1.0 - F0) * pow(1.0 - NV, 5.0);
    vec3 sky = mix(vec3(0.05, 0.05, 0.06), vec3(0.55, 0.62, 0.72), smoothstep(-0.1, 0.9, R.z));
    float box = pow(max(dot(normalize(R), normalize(vec3(-0.35, 0.45, 0.82))), 0.0), 36.0) * 3.2;
    env = (sky * 0.5 + vec3(box)) * fe * pow(1.0 - rough, 2.0) * Li.envK * ao * specK;
  }
  vec3 col = diff + spec + amb + env;
  // свечение «шара света» на самой поверхности (вечерний режим): лужа света, не часть физики
  return col;
}

void main() {
  vec2 p = gl_FragCoord.xy - 0.5 * uRes;
  vec3 d = normalize(uF + uR * (p.x / uFpx) + uU * (p.y / uFpx));
  vec2 suv = gl_FragCoord.xy / uRes;
  if (d.z > -0.0006) { outColor = vec4(vec3(0.012, 0.012, 0.014), 1.0); return; }
  float t = -uEye.z / d.z; vec3 P = uEye + d * t; vec3 V = normalize(-d);
  if (uDebug == 1) { Tile tt = tileAt(P.xy); int c = tt.col + OFF, r = tt.row + OFF; outColor = vec4(hash2(c, r), tt.inside ? 1.0 : 0.0, clamp(tt.edge * 8.0 + 0.5, 0.0, 1.0), 1.0); return; }
  vec3 col;
  float mB = 0.0; float dd = 0.0;
  if (uSweepOn == 1) {
    dd = dot(vec2((suv.x - 0.5) * uAspect, suv.y - 0.5), uSweepDir);
    mB = 1.0 - smoothstep(uSweepPos - uSweepSoft, uSweepPos + uSweepSoft, dd);
  }
  if (mB <= 0.002) col = shadeMat(0, P, V);
  else if (mB >= 0.998) col = shadeMat(1, P, V);
  else col = mix(shadeMat(0, P, V), shadeMat(1, P, V), mB);
  if (uSweepOn == 1) {
    float g = exp(-pow((dd - uSweepPos) / 0.012, 2.0)) * uSweepGlow;               // светящаяся кромка перехода
    float line = (1.0 - smoothstep(0.0, 0.0016, abs(dd - uSweepPos))) * uSweepLine;  // тонкая линия сравнения
    col += vec3(1.0, 0.93, 0.8) * g * 1.4 + vec3(line * 1.2);
  }
  // сцена: уход в тьму к горизонту и по краям, лёгкая виньетка
  float fog = exp(-max(t - DIST_FOG, 0.0) * 0.0042);
  vec2 q = suv - 0.5; q.x *= uAspect; float vig = 1.0 - smoothstep(0.38, 0.95, length(q));
  col *= mix(0.22, 1.0, vig) * mix(0.0, 1.0, fog);
  col *= uExposure; col = acesFilm(col);
  col = pow(col, vec3(1.0 / 2.2));
  if (uQ < 2) col += (hash12(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * (uMode == 1 ? 0.028 : 0.016);   // зерно плёнки
  else col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`.replace('DIST_FOG', DIST.toFixed(1));

const MODES = { day: 0, evening: 1, side: 2 };
const EXPOSURE = { day: 0.85, evening: 1.15, side: 1.0 };

function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Шейдер: ' + gl.getShaderInfoLog(s));
  return s;
}
const srgbToLin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
export const hexToLinear = hex => [1, 3, 5].map(i => srgbToLin(parseInt(hex.slice(i, i + 2), 16)));

export class LabGL {
  static supported() { try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch { return false; } }
  constructor(canvas, { level = 0 } = {}) {
    this.canvas = canvas; this.level = level;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL 2 недоступен');
    this.gl = gl; this.sources = []; this.lost = false; this.u = {};
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.info = { renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE) };
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; this.onlost?.(); });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.#init(); this.#uploadAll(); this.onrestored?.(); });
    this.#init();
  }
  #init() {
    const gl = this.gl;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, 'aPos'); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('Программа: ' + gl.getProgramInfoLog(prog));
    this.prog = prog; this.u = new Proxy({}, { get: (o, k) => (k in o ? o[k] : (o[k] = gl.getUniformLocation(prog, k))) });
    this.vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.albedoTex = null; this.normalTex = null;
  }
  /** materials: [{ source: ImageBitmap | HTMLImageElement | HTMLCanvasElement, photo: [w, h] см, surf: { rough, relief, micro, f0 } }] */
  setMaterials(materials) { this.sources = materials; this.#uploadAll(); }
  get texSize() { return Math.min(LEVELS[this.level].tex, this.info.maxTexture); }
  #uploadAll() {
    const gl = this.gl, n = this.texSize, count = this.sources.length;
    if (!count) return;
    for (const t of [this.albedoTex, this.normalTex]) if (t) gl.deleteTexture(t);
    this.albedoTex = gl.createTexture(); this.normalTex = gl.createTexture();
    const mips = Math.floor(Math.log2(n)) + 1;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.albedoTex); gl.texStorage3D(gl.TEXTURE_2D_ARRAY, mips, gl.SRGB8_ALPHA8, n, n, count);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.normalTex); gl.texStorage3D(gl.TEXTURE_2D_ARRAY, mips, gl.RGBA8, n, n, count);
    const cv = document.createElement('canvas'); cv.width = cv.height = n; const g = cv.getContext('2d', { willReadFrequently: true });
    this.avg = [];
    this.sources.forEach((m, i) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, n, n); g.imageSmoothingQuality = 'high';
      const sw = m.source.width || m.source.naturalWidth, sh = m.source.height || m.source.naturalHeight, ins = Math.round(Math.min(sw, sh) * 0.012);   // убираем край кадра: тени и сжатие
      g.drawImage(m.source, ins, ins, sw - 2 * ins, sh - 2 * ins, 0, 0, n, n);
      const px = g.getImageData(0, 0, n, n);
      this.avg.push(averageColor(px.data, n).map(v => srgbToLin(v)));
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.albedoTex);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, n, n, 1, gl.RGBA, gl.UNSIGNED_BYTE, px.data);
      const nm = buildNormalMap(px.data, n, { blur: n >= 1024 ? 2 : 1, strength: 3 });
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.normalTex);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, n, n, 1, gl.RGBA, gl.UNSIGNED_BYTE, nm);
    });
    for (const t of [this.albedoTex, this.normalTex]) {
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t); gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (this.aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(LEVELS[this.level].aniso, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    }
  }
  setLevel(level) { const old = this.texSize; this.level = Math.max(0, Math.min(LEVELS.length - 1, level)); if (this.texSize !== old && this.sources.length) this.#uploadAll(); else if (this.aniso) this.#applyAniso(); }
  #applyAniso() { const gl = this.gl; for (const t of [this.albedoTex, this.normalTex]) if (t) { gl.bindTexture(gl.TEXTURE_2D_ARRAY, t); gl.texParameterf(gl.TEXTURE_2D_ARRAY, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(LEVELS[this.level].aniso, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT))); } }

  /** Рисует кадр в холст текущего размера (canvas.width × canvas.height). cssWidth — ширина вида в CSS-пикселях (для масштаба ppcm). */
  render(state, { cssWidth = this.canvas.clientWidth || this.canvas.width, debug = false, time = 0 } = {}) {
    if (this.lost || !this.albedoTex) return;
    const gl = this.gl, W = this.canvas.width, H = this.canvas.height;
    gl.viewport(0, 0, W, H); gl.useProgram(this.prog);
    const cam = state.cam, b = basis(cam), ppcmBuf = cam.ppcm * (W / cssWidth), u = this.u;
    gl.uniform2f(u.uRes, W, H); gl.uniform3f(u.uEye, ...b.eye); gl.uniform3f(u.uF, ...b.F); gl.uniform3f(u.uR, ...b.R); gl.uniform3f(u.uU, ...b.U); gl.uniform1f(u.uFpx, ppcmBuf * DIST);
    gl.uniform2f(u.uTile, state.tile.w, state.tile.h); gl.uniform1f(u.uJoint, state.joint); gl.uniform1i(u.uBond, BONDS.find(x => x.id === state.bond)?.mode ?? 0);
    const jc = JOINT_COLORS.find(x => x.id === state.jointColor) || JOINT_COLORS[0];
    gl.uniform3f(u.uJointRGB, ...(jc.color ? hexToLinear(jc.color) : [0.5, 0.5, 0.5])); gl.uniform1f(u.uJointTone, jc.color ? 0 : 1);
    const idx = [state.a, state.b], mats = this.sources;
    gl.uniform1fv(u['uLayer[0]'] && u['uLayer[0]'], new Float32Array(idx));
    gl.uniform2fv(u['uPhoto[0]'], new Float32Array(idx.flatMap(i => mats[i].photo)));
    gl.uniform4fv(u['uSurf[0]'], new Float32Array(idx.flatMap(i => [mats[i].surf.rough, mats[i].surf.relief, mats[i].surf.micro, mats[i].surf.f0])));
    gl.uniform3fv(u['uAvg[0]'], new Float32Array(idx.flatMap(i => this.avg[i])));
    const sw = state.sweep || { on: false };
    gl.uniform1i(u.uSweepOn, sw.on ? 1 : 0); gl.uniform1f(u.uSweepPos, sw.pos ?? 0); gl.uniform2f(u.uSweepDir, ...(sw.dir || [1, 0])); gl.uniform1f(u.uSweepSoft, sw.soft ?? 0.01);
    gl.uniform1f(u.uSweepLine, sw.line ? 1 : 0); gl.uniform1f(u.uSweepGlow, sw.glow ?? 0); gl.uniform1f(u.uAspect, W / H);
    gl.uniform1i(u.uMode, MODES[state.mode] ?? 0); gl.uniform3f(u.uLight, cam.center[0] + state.light.x, cam.center[1] + state.light.y, state.light.h); gl.uniform2f(u.uCenter, cam.center[0], cam.center[1]);
    gl.uniform1f(u.uExposure, (EXPOSURE[state.mode] ?? 1) * (state.exposure ?? 1)); gl.uniform1f(u.uTime, time); gl.uniform1i(u.uQ, state.q ?? LEVELS[this.level].q); gl.uniform1i(u.uDebug, debug ? 1 : 0); gl.uniform1f(u.uTone, state.tone ?? 0.05);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.albedoTex); gl.uniform1i(u.uAlbedo, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.normalTex); gl.uniform1i(u.uNormal, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  finish() { this.gl.finish(); }
  dispose() { try { this.gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch {} }
}
