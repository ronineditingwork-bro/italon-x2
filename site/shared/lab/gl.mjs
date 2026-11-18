// WebGL 2: поверхность из плитки по фотографиям каталога, освещённая управляемым светом; режим «сутки» — комната с окном.
// ЧЕСТНО О МОДЕЛИ: это художественная модель освещения. Цвет берётся с фотографии изделия (снимок уже содержит свет студии), рельеф вычислен по её светлоте
// (настоящего рельефа на фото нет), блеск задан по типу отделки в каталоге; мелкая зернистость дорисована программно. Метод — отражение Кука—Торренса (GGX)
// с картой нормалей, приближённые тени рельефа и условное окружение. Это НЕ физически точное воспроизведение материала. У фотографий низкого разрешения
// рельеф и зерно не дорисовываются вовсе (упрощённый режим): показывается только то, что есть на снимке.
import { basis, DIST } from './camera.mjs';
import { buildNormalMap, averageColor } from './maps.mjs';
import { JOINT_COLORS, BONDS, HASH_OFFSET } from './layout.mjs';
import { LEVELS } from './perf.mjs';
import { WORLD } from './timeofday.mjs';

const VERT = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform vec2 uRes; uniform vec3 uEye, uF, uR, uU; uniform float uFpx;
uniform vec2 uTile; uniform float uJoint; uniform int uBond; uniform vec3 uJointRGB; uniform float uJointTone;
uniform int uSlotOf[2]; uniform vec2 uPhoto[2]; uniform vec4 uSurf[2]; uniform vec3 uAvg[2];
uniform int uSweepOn; uniform float uSweepPos; uniform vec2 uSweepDir; uniform float uSweepSoft; uniform float uSweepLine; uniform float uSweepGlow;
uniform int uMode; uniform vec3 uLight; uniform vec2 uCenter; uniform float uExposure; uniform float uTime;
uniform vec3 uSunDir, uSunCol, uSkyAmb, uLampCol, uGlow;
uniform int uWall; uniform vec4 uWallRect; uniform int uTurn;
uniform int uQ; uniform int uDebug; uniform float uTone; uniform float uAspect;
uniform sampler2D uAlbedo0, uAlbedo1, uNormal0, uNormal1; uniform float uFaces[2];
out vec4 outColor;

const float PI = 3.14159265;
const int OFF = ${HASH_OFFSET};
const float WALL_Y = ${WORLD.wallY.toFixed(1)}, WALL_H = ${WORLD.wallH.toFixed(1)}, WIN_HW = ${WORLD.winHalfW.toFixed(1)}, WIN_Z0 = ${WORLD.winZ0.toFixed(1)}, WIN_Z1 = ${WORLD.winZ1.toFixed(1)}, WIN_ZM = ${WORLD.winZMid.toFixed(1)}, MUL_W = ${WORLD.mullion.toFixed(1)};

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
float rowShift(int row) { int r = row; if (uBond == 1) return float(((r % 2) + 2) % 2) * 0.5; if (uBond == 2) return float(((r % 3) + 3) % 3) / 3.0; return 0.0; }
vec4 texA(int s, vec2 uv) { return s == 0 ? texture(uAlbedo0, uv) : texture(uAlbedo1, uv); }
vec4 texN(int s, vec2 uv) { return s == 0 ? texture(uNormal0, uv) : texture(uNormal1, uv); }

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

// ---- окно комнаты: доля света, прошедшая через проём в стене (мягкая кромка растёт с расстоянием) -------------------------------
float windowMask(vec3 P, vec3 L) {
  if (L.y < 0.03 || L.z <= 0.0) return 0.0;
  float t = (WALL_Y - P.y) / L.y; vec3 H = P + L * t;
  float soft = 0.5 + 0.01 * t;
  float inx = smoothstep(-WIN_HW - soft, -WIN_HW + soft, H.x) * (1.0 - smoothstep(WIN_HW - soft, WIN_HW + soft, H.x));
  float inz = smoothstep(WIN_Z0 - soft, WIN_Z0 + soft, H.z) * (1.0 - smoothstep(WIN_Z1 - soft, WIN_Z1 + soft, H.z));
  float mx = smoothstep(MUL_W * 0.5, MUL_W * 0.5 + soft, abs(H.x));
  float mz = smoothstep(MUL_W * 0.5, MUL_W * 0.5 + soft, abs(H.z - WIN_ZM));
  return inx * inz * mx * mz;
}

// ---- свет по режимам: основной источник ----------------------------------------------------------------------------------------
struct Lit { vec3 L; vec3 color; vec3 amb; float shadowK; float envK; };
Lit lighting(vec3 P) {
  Lit o; vec3 lp = uLight;
  if (uMode == 0) {
    vec3 d = vec3(lp.xy - uCenter, max(lp.z, 8.0) * 2.4); o.L = normalize(d);
    o.color = vec3(1.0, 0.955, 0.87) * 1.7; o.amb = vec3(0.50, 0.58, 0.70) * 0.34; o.shadowK = 0.55; o.envK = 1.0;
  } else if (uMode == 1) {
    vec3 d = lp - P; float r = length(d); o.L = d / r;
    float att = 1.0 / (1.0 + pow(r / 85.0, 2.0)); o.color = vec3(1.0, 0.60, 0.30) * 3.6 * att * (1.0 + 0.04 * sin(uTime * 7.0 + r * 0.03));
    o.amb = vec3(0.16, 0.19, 0.30) * 0.30; o.shadowK = 0.8; o.envK = 0.5;
  } else if (uMode == 2) {
    vec2 h = lp.xy - uCenter; float el = mix(0.07, 0.42, clamp((lp.z - 8.0) / 110.0, 0.0, 1.0));
    vec3 d = vec3(normalize(h + 1e-4) * cos(el), sin(el)); o.L = normalize(d);
    o.color = vec3(0.96, 0.975, 1.0) * 3.6; o.amb = vec3(0.045, 0.05, 0.06); o.shadowK = 1.0; o.envK = 0.25;
  } else if (uWall == 1) {      // сутки у стены: ключевой свет сбоку, цвет и сила — по часу суток
    o.L = normalize(vec3(uSunDir.x * 0.9, 0.25 + 0.45 * max(uSunDir.z, 0.0), 0.62)); o.color = uSunCol * (uSunCol.b > uSunCol.r ? 2.6 : 0.85); o.amb = uSkyAmb * 0.8; o.shadowK = 0.9; o.envK = clamp(dot(uSkyAmb, vec3(0.33)) * 1.4, 0.05, 0.9);
  } else {                      // сутки: солнце или луна сквозь окно + свет неба
    o.L = uSunDir; o.color = uSunCol * windowMask(P, uSunDir); o.amb = uSkyAmb; o.shadowK = 0.9; o.envK = clamp(dot(uSkyAmb, vec3(0.33)) * 1.6, 0.05, 1.0);
  }
  return o;
}

// приближённые тени рельефа и шва: шагаем по лучу к свету по карте высот
float reliefShadow(vec3 L, vec3 P, float jointK, float relief, float h0, vec2 uv, vec4 jac, int s, float shadowK) {
  float sh = 1.0;
  if (L.z <= 0.015) return 0.0;
  if (jointK > 0.5) {
    float depth = 0.28; float w = max(uJoint, 0.02);
    float k = clamp(L.z / max(length(L.xy), 1e-3), 0.0, 4.0);
    sh = mix(0.45, 1.0, clamp(k * w / depth * 0.9, 0.0, 1.0));
  } else if (uQ == 0 && relief > 0.004) {
    float horiz = length(L.xy) + 1e-4; vec2 dir2 = L.xy / horiz; float slope = L.z / horiz;
    float maxD = clamp(relief * 10.0, 0.15, 1.6);
    for (int i = 1; i <= 6; i++) {
      float dist = maxD * float(i) / 6.0;
      vec2 uv2 = vec2(mirror1(uv.x + dist * (dir2.x * jac.x + dir2.y * jac.y)), mirror1(uv.y + dist * (dir2.x * jac.z + dir2.y * jac.w)));
      float hs = texN(s, uv2).a * relief; float rayH = h0 + slope * dist;
      sh = min(sh, 1.0 - clamp((hs - rayH) / (0.03 + relief * 0.12), 0.0, 1.0) * shadowK);
    }
  }
  return sh;
}
vec3 lightTerm(vec3 L, vec3 lc, float sh, vec3 N, vec3 V, vec3 albedo, float rough, float F0, float specK) {
  float NL = max(dot(N, L), 0.0), NV = max(dot(N, V), 1e-3);
  vec3 H = normalize(L + V); float NH = max(dot(N, H), 0.0), VH = max(dot(V, H), 0.0);
  float al = max(rough * rough, 0.012); float a2 = al * al;
  float D = a2 / (PI * pow(NH * NH * (a2 - 1.0) + 1.0, 2.0));
  float kk = (rough + 1.0) * (rough + 1.0) / 8.0; float G = (NL / (NL * (1.0 - kk) + kk)) * (NV / (NV * (1.0 - kk) + kk));
  float F = F0 + (1.0 - F0) * pow(1.0 - VH, 5.0);
  vec3 spec = lc * (D * G * F / max(4.0 * NL * NV, 1e-3)) * NL * sh * specK;
  vec3 diff = albedo * lc * NL * sh * (1.0 - F0);
  return diff + spec;
}

// ---- один материал в одной точке ---------------------------------------------------------------------------------------------------
vec3 shadeMat(int m, vec3 P, vec3 V) {
  Tile t = tileAt(P.xy);
  vec4 S = uSurf[m]; int s = uSlotOf[m]; vec2 ph = uTurn == 1 ? uPhoto[m].yx : uPhoto[m]; bool vary = uWall == 0;
  vec3 N = vec3(0.0, 0.0, 1.0); vec3 albedo; float rough = S.x; float relief = S.y; float h0 = 0.0; float jointK = 0.0;
  vec4 jac = vec4(0.0); vec2 uv = vec2(0.5); float specK = 1.0;
  Lit Li = lighting(P);
  if (t.inside) {
    int c = t.col + OFF, r = t.row + OFF;
    float a = hash2(c, r), b = hash2(c + 7919, r + 104729), cc = hash2(r * 31 + 5, c * 17 + 3), dd = hash2(c ^ 23505, r ^ 112755);
    bool fx = vary && a > 0.5, fy = vary && b > 0.5;
    vec2 tuv = vec2(t.l.x / uTile.x, t.l.y / uTile.y);
    if (fx) tuv.x = 1.0 - tuv.x; if (fy) tuv.y = 1.0 - tuv.y;
    vec2 sw = vec2(uTile.x / ph.x, uTile.y / ph.y);
    vec2 off = vec2(sw.x < 1.0 ? cc * (1.0 - sw.x) : 0.0, sw.y < 1.0 ? dd * (1.0 - sw.y) : 0.0);
    vec2 puv = off + tuv * sw;
    vec2 q2 = vec2(mirror1(puv.x), mirror1(puv.y)); vec2 uvp = uTurn == 1 ? vec2(q2.y, 1.0 - q2.x) : q2;     // поворот плиты на 90°: рисунок поворачивается, а не растягивается
    uv = vec2(uvp.x, 1.0 - uvp.y);
    float nf = uFaces[s]; if (nf > 1.5) uv.x = (mod(float(c + r), nf) + uv.x) / nf;     // у плиты несколько настоящих фейсов: фейсы лежат в атласе подряд, плиты берут их по очереди
    float dxu = (fx ? -1.0 : 1.0) * sw.x / uTile.x, dyv = (fy ? -1.0 : 1.0) * sw.y / uTile.y;
    jac = uTurn == 1 ? vec4(0.0, dyv, dxu, 0.0) : vec4(dxu, 0.0, 0.0, -dyv);
    if (nf > 1.5) jac.xy /= nf;
    albedo = texA(s, uv).rgb;
    if (vary) albedo *= 1.0 + (a - 0.5) * uTone;
    vec4 nmh = texN(s, uv); vec2 nxy = nmh.xy * 2.0 - 1.0; if (uTurn == 1) nxy = vec2(-nxy.y, nxy.x); if (fx) nxy.x = -nxy.x; if (fy) nxy.y = -nxy.y;
    float ns = clamp(relief / 0.07, 0.0, 3.2);
    nxy *= ns;
    if (uQ < 2 && S.z > 0.0) { vec2 mp = P.xy * 9.0; nxy += (vec2(vnoise(mp), vnoise(mp + 17.3)) - 0.5) * 2.0 * S.z; }
    float bev = 1.0 - smoothstep(0.0, 0.16, t.edge);
    nxy += t.outDir * bev * 0.55;
    N = normalize(vec3(nxy, 1.0));
    h0 = nmh.a * relief;
    albedo *= mix(1.0, 0.82, bev * 0.6);
  } else {
    jointK = 1.0; vec3 jc = mix(uJointRGB, uAvg[m] * 0.85, uJointTone);
    albedo = jc * (0.92 + 0.16 * vnoise(P.xy * 14.0)); rough = 0.92; relief = 0.0; h0 = -0.22;
    N = normalize(vec3((vec2(vnoise(P.xy * 11.0), vnoise(P.xy * 11.0 + 9.0)) - 0.5) * 0.35, 1.0));
    specK = 0.35;
  }
  vec3 V2 = V; float F0 = S.w;
  float ao = jointK > 0.5 ? 0.78 : mix(0.82, 1.0, smoothstep(0.0, 0.35, t.edge));
  if (relief > 0.004) ao *= mix(0.78, 1.0, clamp(h0 / relief, 0.0, 1.0));
  vec3 col = albedo * Li.amb * ao;
  if (dot(Li.color, Li.color) > 1e-5) col += lightTerm(Li.L, Li.color, reliefShadow(Li.L, P, jointK, relief, h0, uv, jac, s, Li.shadowK), N, V2, albedo, rough, F0, specK);
  if (uMode == 3) {              // лампа в комнате: её положение — «шар света»
    vec3 d = uLight - P; float r = length(d); vec3 Ll = d / r; float att = 1.0 / (1.0 + pow(r / 95.0, 2.0));
    vec3 lc = uLampCol * att;
    if (dot(lc, lc) > 1e-5) col += lightTerm(Ll, lc, reliefShadow(Ll, P, jointK, relief, h0, uv, jac, s, 0.8), N, V2, albedo, rough, F0, specK);
  }
  if (uQ < 2) {
    vec3 R = reflect(-V2, N); float NV = max(dot(N, V2), 1e-3); float fe = F0 + (1.0 - F0) * pow(1.0 - NV, 5.0);
    vec3 sky = mix(vec3(0.05, 0.05, 0.06), vec3(0.55, 0.62, 0.72), smoothstep(-0.1, 0.9, R.z));
    if (uMode == 3) sky = mix(vec3(0.02), uSkyAmb * 1.8 + uGlow * 0.15, smoothstep(-0.1, 0.9, R.z));
    float box = pow(max(dot(normalize(R), normalize(vec3(-0.35, 0.45, 0.82))), 0.0), 36.0) * 3.2;
    if (uMode == 3) box = pow(max(dot(normalize(R), normalize(vec3(0.0, 0.85, 0.5))), 0.0), 14.0) * dot(uGlow, vec3(0.33)) * 1.2;
    vec3 env = (sky * 0.5 + vec3(box)) * fe * pow(1.0 - rough, 2.0) * Li.envK * ao * specK;
    col += env;
  }
  return col;
}

// ---- стена с окном (режим «сутки») -------------------------------------------------------------------------------------------------
vec3 shadeWall(vec3 P) {
  vec3 N = vec3(0.0, -1.0, 0.0), plaster = vec3(0.16, 0.15, 0.14);
  float ax = abs(P.x);
  bool inWin = ax < WIN_HW && P.z > WIN_Z0 && P.z < WIN_Z1 && ax > MUL_W * 0.5 && abs(P.z - WIN_ZM) > MUL_W * 0.5;
  bool frame = ax < WIN_HW + 3.0 && P.z > WIN_Z0 - 3.0 && P.z < WIN_Z1 + 3.0 && !inWin;
  if (inWin) return uGlow * (0.75 + 0.4 * smoothstep(WIN_Z0, WIN_Z1, P.z));
  vec3 col = plaster * uSkyAmb * 0.9;
  vec3 d = uLight - P; float r = length(d); float att = 1.0 / (1.0 + pow(r / 95.0, 2.0));
  col += plaster * uLampCol * att * max(dot(N, d / r), 0.0) * 0.8;
  if (frame) col *= 0.45;
  col += plaster * uGlow * 0.10 * exp(-length(vec2(max(ax - WIN_HW, 0.0), max(P.z - WIN_Z1, 0.0))) * 0.012);   // свечение окна на стене
  return col;
}

vec3 surfaceAt(vec3 P, vec3 V, float mB) {
  vec3 c0 = vec3(0.0), c1 = vec3(0.0);
  if (mB < 0.998) c0 = shadeMat(0, P, V);
  if (mB > 0.002) c1 = shadeMat(1, P, V);
  return mix(c0, c1, mB);
}
// ---- окружение стены: тёмный зал; полированный пол отражает стену (само отражение считается тем же вызовом surfaceAt, что и стена) ----
vec3 backdropBase(vec3 P) {
  vec3 col = vec3(0.016, 0.016, 0.019);
  float x0 = uWallRect.x, x1 = uWallRect.z, y0 = uWallRect.y;
  if (P.y < y0) {
    float dist = y0 - P.y, inX = step(x0, P.x) * step(P.x, x1);
    col += uAvg[0] * 0.05 * exp(-dist / 30.0) * inX;
    vec3 d = uLight - vec3(P.x, P.y, 0.0); col += uLampCol * 0.006 / (1.0 + dot(d, d) / 9000.0);
  }
  return col;
}

void main() {
  vec2 p = gl_FragCoord.xy - 0.5 * uRes;
  vec3 d = normalize(uF + uR * (p.x / uFpx) + uU * (p.y / uFpx));
  vec2 suv = gl_FragCoord.xy / uRes;
  bool room = uMode == 3 && uWall == 0 && uDebug == 0;
  bool hasFloor = d.z < -0.0006; float tf = hasFloor ? -uEye.z / d.z : 1e9;
  if (hasFloor && room && (uEye + d * tf).y > WALL_Y) { hasFloor = false; tf = 1e9; }
  vec3 col; float t = tf;
  if (room) {
    float tw = d.y > 1e-4 ? (WALL_Y - uEye.y) / d.y : -1.0;
    if (tw > 0.0 && tw < tf) {
      vec3 Pw = uEye + d * tw;
      if (Pw.z >= 0.0 && Pw.z <= WALL_H) { hasFloor = false; col = shadeWall(Pw); t = tw; }
    }
  }
  if (!hasFloor && !(room && t < 1e8)) { outColor = vec4(vec3(0.012, 0.012, 0.014), 1.0); return; }
  if (hasFloor) {
    vec3 P = uEye + d * tf; vec3 V = normalize(-d);
    if (uDebug == 1) { Tile tt = tileAt(P.xy); int c = tt.col + OFF, r = tt.row + OFF; outColor = vec4(hash2(c, r), tt.inside ? 1.0 : 0.0, clamp(tt.edge * 8.0 + 0.5, 0.0, 1.0), 1.0); return; }
    float mB = 0.0; float dd = 0.0;
    if (uSweepOn == 1) { dd = dot(vec2((suv.x - 0.5) * uAspect, suv.y - 0.5), uSweepDir); mB = 1.0 - smoothstep(uSweepPos - uSweepSoft, uSweepPos + uSweepSoft, dd); }
    vec3 Ps = P; float wgt = 1.0, keep = 0.0; vec3 base = vec3(0.0);
    if (uWall == 1) {                       // край стены сглаживается по размеру пикселя на поверхности; пол отражает стену
      float fp = tf / uFpx / max(-d.z, 0.2), e = min(min(P.x - uWallRect.x, uWallRect.z - P.x), min(P.y - uWallRect.y, uWallRect.w - P.y)), cov = clamp(e / max(fp, 1e-4) + 0.5, 0.0, 1.0);
      base = backdropBase(P); wgt = cov; keep = 1.0 - cov;
      if (cov <= 0.0) {
        float dist = uWallRect.y - P.y, inX = step(uWallRect.x, P.x) * step(P.x, uWallRect.z);
        wgt = P.y < uWallRect.y ? exp(-dist / 55.0) * 0.42 * inX : 0.0; keep = 1.0;
        Ps = vec3(clamp(P.x, uWallRect.x + 0.01, uWallRect.z - 0.01), uWallRect.y + max(dist, 0.0), 0.0);
        if (Ps.y >= uWallRect.w) wgt = 0.0;
      }
    }
    col = base * keep;
    if (wgt > 0.01) col += surfaceAt(Ps, V, mB) * wgt;
    if (uSweepOn == 1) {
      float g = exp(-pow((dd - uSweepPos) / 0.012, 2.0)) * uSweepGlow;
      float line = (1.0 - smoothstep(0.0, 0.0016, abs(dd - uSweepPos))) * uSweepLine;
      col += vec3(1.0, 0.93, 0.8) * g * 1.4 + vec3(line * 1.2);
    }
  }
  float fog = exp(-max(t - ${DIST.toFixed(1)}, 0.0) * 0.0042);
  vec2 q = suv - 0.5; q.x *= uAspect; float vig = 1.0 - smoothstep(0.38, 0.95, length(q));
  col *= mix(0.22, 1.0, vig) * fog;
  col *= uExposure; col = acesFilm(col);
  col = pow(col, vec3(1.0 / 2.2));
  if (uQ < 2) col += (hash12(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * (uMode == 1 || (uMode == 3 && dot(uLampCol, vec3(1.0)) > 1.0) ? 0.026 : 0.016);
  else col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`;

const MODES = { day: 0, evening: 1, side: 2, time: 3 };
const EXPOSURE = { day: 0.85, evening: 1.15, side: 1.0, time: 1.0 };

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
    this.gl = gl; this.slots = [null, null]; this.cache = new Map(); this.lost = false; this.u = {}; this.uploads = [];
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.info = { renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE) };
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; this.onlost?.(); });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.cache = new Map(); this.#init(); this.onrestored?.(); });
    this.#init();
  }
  #init() {
    const gl = this.gl, prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, 'aPos'); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('Программа: ' + gl.getProgramInfoLog(prog));
    this.prog = prog; this.u = new Proxy({}, { get: (o, k) => (k in o ? o[k] : (o[k] = gl.getUniformLocation(prog, k))) });
    this.vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.flat = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.flat);                 // «плоская» нормаль для фото без рельефа
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 255, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }
  get texCap() { return Math.min(LEVELS[this.level].tex, this.info.maxTexture); }
  /** Подготовка материала: фото в видеопамять в РОДНОМ разрешении (до texCap), для полноценных фото — ещё и карта нормалей из светлоты. Идемпотентна. */
  prepare(m) {
    const hit = this.cache.get(m.key); if (hit && hit.cap === this.texCap && hit.hd === (m.quality === 'hd')) { hit.used = performance.now(); return hit; }
    if (hit) this.#drop(hit);
    const gl = this.gl, t0 = performance.now(), src = m.source; let e_nbytes = 0;
    const faces = m.faces && m.faces.length > 1 ? m.faces : [src], nf = faces.length;                // несколько настоящих фейсов плиты складываются в один атлас подряд по ширине
    const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height, k = Math.min(1, this.texCap / Math.max(sw * nf, sh));
    const fw = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k)), w = fw * nf;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d', { willReadFrequently: true });
    const ins = m.quality === 'hd' ? Math.round(Math.min(sw, sh) * 0.012 * k) : 0;                      // у полноценных фото срезаем краешек кадра (тени, сжатие)
    g.imageSmoothingQuality = 'high';
    faces.forEach((f, i) => { const fsw = f.naturalWidth || f.width, fsh = f.naturalHeight || f.height; g.drawImage(f, ins * (fsw / fw) | 0, ins * (fsh / h) | 0, fsw - 2 * ins / k, fsh - 2 * ins / k, i * fw, 0, fw, h); });
    const px = g.getImageData(0, 0, w, h);
    const levels = Math.floor(Math.log2(Math.max(w, h))) + 1;
    const mk = (internal, data, filterMag) => {
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texStorage2D(gl.TEXTURE_2D, levels, internal, w, h);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data); gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filterMag);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(LEVELS[this.level].aniso, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      return tex;
    };
    const albedo = mk(gl.SRGB8_ALPHA8, px.data, gl.LINEAR);
    let normal = this.flat, ownNormal = false;
    if (m.quality === 'hd') {                                   // карта рельефа не требует полного разрешения: на слабых уровнях считаем по уменьшенной копии (в разы быстрее)
      const nCap = this.level === 0 ? 1024 : 512, kn = Math.min(1, nCap / Math.max(w, h)), nw = Math.max(1, Math.round(w * kn)), nh = Math.max(1, Math.round(h * kn));
      let nd = px.data; if (kn < 1) { const c2 = document.createElement('canvas'); c2.width = nw; c2.height = nh; const g2 = c2.getContext('2d', { willReadFrequently: true }); g2.imageSmoothingQuality = 'high'; g2.drawImage(cv, 0, 0, nw, nh); nd = g2.getImageData(0, 0, nw, nh).data; }
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); const nl = Math.floor(Math.log2(Math.max(nw, nh))) + 1; gl.texStorage2D(gl.TEXTURE_2D, nl, gl.RGBA8, nw, nh);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, nw, nh, gl.RGBA, gl.UNSIGNED_BYTE, buildNormalMap(nd, nw, nh, { blur: Math.max(nw, nh) >= 1024 ? 2 : 1, strength: 3 })); gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      normal = tex; ownNormal = true; e_nbytes = nw * nh * 4 * 1.33;
    }
    const avg = averageColor(px.data, w, h).map(srgbToLin), e = { key: m.key, albedo, normal, ownNormal, nbytes: e_nbytes, w, h, faces: nf, avg, cap: this.texCap, hd: m.quality === 'hd', used: performance.now() };
    this.cache.set(m.key, e); this.uploads.push({ key: m.key, ms: performance.now() - t0, w, h, hd: e.hd }); if (this.uploads.length > 20) this.uploads.shift();
    this.#evict(); return e;
  }
  #drop(e) { const gl = this.gl; gl.deleteTexture(e.albedo); if (e.ownNormal) gl.deleteTexture(e.normal); this.cache.delete(e.key); }
  #evict() {
    const keep = new Set(this.slots.filter(Boolean).map(m => m.key)), list = [...this.cache.values()].filter(e => !keep.has(e.key)).sort((a, b) => a.used - b.used);
    while (this.cache.size > 5 && list.length) this.#drop(list.shift());
  }
  /** Материалы в двух «ячейках» (0 — основа, 1 — вторая сторона шторки). Каждый: { key, source, photo:[w,h] см, surf, quality }. */
  setSlots(list) { this.slots = [list[0] || null, list[1] || list[0] || null]; this.slots.forEach(m => m && this.prepare(m)); this.#evict(); }
  setMaterials(list) { this.setSlots(list); }
  setLevel(level) { const old = this.texCap; this.level = Math.max(0, Math.min(LEVELS.length - 1, level)); if (this.texCap !== old) this.slots.forEach(m => m && this.prepare(m)); else this.#applyAniso(); }
  #applyAniso() { if (!this.aniso) return; const gl = this.gl, a = Math.min(LEVELS[this.level].aniso, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)); for (const e of this.cache.values()) { for (const t of [e.albedo, e.ownNormal ? e.normal : null]) if (t) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, a); } } }
  get textureBytes() { let n = 0; for (const e of this.cache.values()) n += e.w * e.h * 4 * 1.33 + (e.nbytes || 0); return n; }

  /** Рисует кадр в холст текущего размера. state.a/state.b — номера ячеек (0 или 1) для двух сторон шторки. */
  render(state, { cssWidth = this.canvas.clientWidth || this.canvas.width, debug = false, time = 0 } = {}) {
    if (this.lost || !this.slots[0]) return;
    const gl = this.gl, W = this.canvas.width, H = this.canvas.height, slots = this.slots.map(m => this.prepare(m));
    gl.viewport(0, 0, W, H); gl.useProgram(this.prog);
    const cam = state.cam, b = basis(cam), ppcmBuf = cam.ppcm * (W / cssWidth), u = this.u;
    gl.uniform2f(u.uRes, W, H); gl.uniform3f(u.uEye, ...b.eye); gl.uniform3f(u.uF, ...b.F); gl.uniform3f(u.uR, ...b.R); gl.uniform3f(u.uU, ...b.U); gl.uniform1f(u.uFpx, ppcmBuf * DIST);
    gl.uniform2f(u.uTile, state.tile.w, state.tile.h); gl.uniform1f(u.uJoint, state.joint); gl.uniform1i(u.uBond, BONDS.find(x => x.id === state.bond)?.mode ?? 0);
    const jc = JOINT_COLORS.find(x => x.id === state.jointColor) || JOINT_COLORS[0];
    gl.uniform3f(u.uJointRGB, ...(jc.color ? hexToLinear(jc.color) : [0.5, 0.5, 0.5])); gl.uniform1f(u.uJointTone, jc.color ? 0 : 1);
    const idx = [state.a | 0, state.b | 0], ms = idx.map(i => this.slots[i]), es = idx.map(i => slots[i]);
    gl.uniform1iv(u['uSlotOf[0]'], new Int32Array(idx));
    gl.uniform2fv(u['uPhoto[0]'], new Float32Array(ms.flatMap(m => m.photo)));
    gl.uniform4fv(u['uSurf[0]'], new Float32Array(ms.flatMap(m => [m.surf.rough, m.surf.relief, m.surf.micro, m.surf.f0])));
    gl.uniform3fv(u['uAvg[0]'], new Float32Array(es.flatMap(e => e.avg)));
    gl.uniform1fv(u['uFaces[0]'], new Float32Array(es.map(e => e.faces || 1)));
    const sw = state.sweep || { on: false };
    gl.uniform1i(u.uSweepOn, sw.on ? 1 : 0); gl.uniform1f(u.uSweepPos, sw.pos ?? 0); gl.uniform2f(u.uSweepDir, ...(sw.dir || [1, 0])); gl.uniform1f(u.uSweepSoft, sw.soft ?? 0.01);
    gl.uniform1f(u.uSweepLine, sw.line ? 1 : 0); gl.uniform1f(u.uSweepGlow, sw.glow ?? 0); gl.uniform1f(u.uAspect, W / H);
    gl.uniform1i(u.uMode, MODES[state.mode] ?? 0); gl.uniform3f(u.uLight, cam.center[0] + state.light.x, cam.center[1] + state.light.y, state.light.h); gl.uniform2f(u.uCenter, cam.center[0], cam.center[1]);
    const sky = state.sky || { sunDir: [0, 0.6, 0.8], sunCol: [0, 0, 0], amb: [0.1, 0.1, 0.1], lamp: [0, 0, 0], glow: [0.1, 0.1, 0.1], exposure: 1 };
    gl.uniform3f(u.uSunDir, ...sky.sunDir); gl.uniform3f(u.uSunCol, ...sky.sunCol); gl.uniform3f(u.uSkyAmb, ...sky.amb); gl.uniform3f(u.uLampCol, ...sky.lamp); gl.uniform3f(u.uGlow, ...sky.glow);
    gl.uniform1f(u.uExposure, (EXPOSURE[state.mode] ?? 1) * (state.mode === 'time' ? sky.exposure : 1) * (state.exposure ?? 1)); gl.uniform1f(u.uTime, time);
    gl.uniform1i(u.uWall, state.wall ? 1 : 0); gl.uniform4f(u.uWallRect, ...(state.wall?.rect || [0, 0, 0, 0])); gl.uniform1i(u.uTurn, state.turn ? 1 : 0);
    gl.uniform1i(u.uQ, state.q ?? LEVELS[this.level].q); gl.uniform1i(u.uDebug, debug ? 1 : 0); gl.uniform1f(u.uTone, state.tone ?? 0.05);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, slots[0].albedo); gl.uniform1i(u.uAlbedo0, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, slots[1].albedo); gl.uniform1i(u.uAlbedo1, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, slots[0].normal); gl.uniform1i(u.uNormal0, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, slots[1].normal); gl.uniform1i(u.uNormal1, 3);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  finish() { this.gl.finish(); }
  dispose() { try { this.gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch {} }
}
