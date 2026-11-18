// Бассейн Lab: WebGL 2. Сцена хранит карту плитки (координаты в метрах + номер зоны) и свет снимка
// (основа без плитки + свет на единицу альбедо, см. scripts/pool-lab/photo_scene.py). Любая плитка каталога
// перекрашивается под тот же свет: цвет = основа + плитка × свет. Слот «pool» у фото-сцен хранит вечерний кадр.
const GROUPS = ['sun', 'pool'];
const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uMapU, uMapV, uBase0, uBase1, uLight0, uLight1, uTile1, uTile2, uTile3;
uniform vec2 uScale0, uScale1, uSize1, uSize2, uSize3, uCrop1, uCrop2, uCrop3;
uniform float uGain0, uGain1, uOffset, uHeight;
uniform vec3 uGrout;
out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 hdr(sampler2D s, ivec2 p, float k) { return pow(texelFetch(s, p, 0).rgb, vec3(2.2)) * k; }
vec3 tile(sampler2D tex, vec2 m, vec2 size, vec2 crop) {
  m.x += uOffset * mod(floor(m.y / size.y), 2.0) * size.x;
  vec2 q = m / size, cell = floor(q), f = fract(q);
  vec2 dx = clamp(dFdx(q), -0.25, 0.25), dy = clamp(dFdy(q), -0.25, 0.25);   // скачки карты у кромки воды не размывают текстуру
  if (hash(cell) > 0.5) f = 1.0 - f;                                          // половина плит повёрнута на 180°
  vec2 st = f.yx, gx = dx.yx * crop, gy = dy.yx * crop;                       // фото плитки вертикальное: длинная сторона — ось y
  st = st * crop + vec2(hash(cell + 3.1), hash(cell + 5.7)) * (1.0 - crop);   // со скана слэба — свой участок для каждой плиты
  vec3 c = textureGrad(tex, st, gx, gy).rgb * (0.97 + 0.06 * hash(cell + 7.3));
  vec2 edge = min(fract(q), 1.0 - fract(q)) * size;
  vec2 px = clamp(vec2(length(vec2(dFdx(m.x), dFdy(m.x))), length(vec2(dFdx(m.y), dFdy(m.y)))), vec2(1e-4), vec2(0.05));
  vec2 cov = clamp((0.0015 + px * 0.5 - edge) / px, 0.0, 1.0) * min(vec2(1.0), 0.003 / px);   // шов 3 мм с честным сглаживанием
  return mix(c, uGrout, max(cov.x, cov.y));
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.x, uHeight - 1.0 - gl_FragCoord.y);
  vec3 a = texelFetch(uMapU, p, 0).rgb, b = texelFetch(uMapV, p, 0).rgb;
  int zone = int(round(a.b * 255.0 / 80.0));
  vec2 m = vec2(round(a.r * 255.0) * 256.0 + round(a.g * 255.0), round(b.r * 255.0) * 256.0 + round(b.g * 255.0)) / 1000.0;
  vec3 alb = zone == 1 ? tile(uTile1, m, uSize1, uCrop1) : zone == 2 ? tile(uTile2, m, uSize2, uCrop2) : zone == 3 ? tile(uTile3, m, uSize3, uCrop3) : vec3(0.0);
  vec3 x = uGain0 * (hdr(uBase0, p, uScale0.x) + alb * hdr(uLight0, p, uScale0.y)) + uGain1 * (hdr(uBase1, p, uScale1.x) + alb * hdr(uLight1, p, uScale1.y));
  x = clamp(x, 0.0, 1.0);
  outColor = vec4(mix(12.92 * x, 1.055 * pow(x, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, x)), 1.0);
}`;
const UNITS = ['uMapU', 'uMapV', 'uBase0', 'uBase1', 'uLight0', 'uLight1', 'uTile1', 'uTile2', 'uTile3'];

export const loadImage = src => new Promise((ok, fail) => { const i = new Image(); i.decoding = 'async'; i.onload = () => ok(i); i.onerror = () => fail(new Error(`Не удалось загрузить ${src}`)); i.src = src; });

export function createEngine(canvas) {
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0,1);}'));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const U = {}; for (let i = 0, n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS); i < n; i++) { const name = gl.getActiveUniform(prog, i).name; U[name] = gl.getUniformLocation(prog, name); }
  UNITS.forEach((n, i) => gl.uniform1i(U[n], i));
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  const texture = (img, srgb) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    if (img) gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    if (srgb && img) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8); }
    else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, srgb ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const scenes = new Map(), tiles = new Map();
  return {
    /** Слои сцены: карта u, v и свет по группам; возвращает zoneAt(x, y) для выбора зоны кликом. */
    loadScene(id, scene, base) {
      if (!scenes.has(id)) scenes.set(id, (async () => {
        const files = ['u', 'v', ...GROUPS.map(g => `${g}-base`), ...GROUPS.map(g => `${g}-light`)];
        const imgs = await Promise.all(files.map(f => f.length === 1 || scene.layers[f.split('-')[0]] ? loadImage(`${base}${id}-${f}.${f.length === 1 ? 'png' : 'webp'}`) : null));
        const [W, H] = scene.resolution, c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(imgs[0], 0, 0); const px = g.getImageData(0, 0, W, H).data;
        return { textures: imgs.map(i => texture(i, false)), zoneAt: (x, y) => Math.round(px[(y * W + x) * 4 + 2] / 80) };
      })().catch(e => { scenes.delete(id); throw e; }));
      return scenes.get(id);
    },
    loadTile(src) {
      if (!tiles.has(src)) tiles.set(src, loadImage(src).then(i => texture(i, true)).catch(e => { tiles.delete(src); throw e; }));
      return tiles.get(src);
    },
    /** zones: [{ texture, size: [длинная, короткая] м, crop: [доля ширины, доля высоты] }] для зон 1–3. */
    draw({ scene, sceneTex, zones, light, offset, grout }) {
      const [W, H] = scene.resolution;
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      sceneTex.textures.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); });
      zones.forEach((z, i) => { gl.activeTexture(gl.TEXTURE6 + i); gl.bindTexture(gl.TEXTURE_2D, z.texture); gl.uniform2f(U[`uSize${i + 1}`], ...z.size); gl.uniform2f(U[`uCrop${i + 1}`], ...z.crop); });
      const evening = light === 'dusk' && scene.layers.pool;
      GROUPS.forEach((g, i) => gl.uniform2f(U[`uScale${i}`], scene.layers[g]?.base ?? 0, scene.layers[g]?.light ?? 0));
      gl.uniform1f(U.uGain0, evening ? 0 : 1); gl.uniform1f(U.uGain1, evening ? 1 : 0);
      gl.uniform1f(U.uOffset, offset); gl.uniform3fv(U.uGrout, grout.map(c => c ** 2.2)); gl.uniform1f(U.uHeight, H);
      gl.viewport(0, 0, W, H); gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
