// Экспорт: снимок (JPG) и короткий ролик (MediaRecorder) для соцсетей. Рисуем отдельным холстом нужного размера и вторым контекстом WebGL,
// поэтому основной вид не мигает. На кадре — название коллекции, изделие, артикул и адрес карточки товара.
import { LabGL } from './gl.mjs';
import { Canvas2DView } from './canvas2d.mjs';
import { choreograph } from './motion.mjs';

export const EXPORT_SIZES = { story: [720, 1280], square: [1080, 1080], portrait: [864, 1080] };

export function videoSupport() {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
  const list = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mime = list.find(m => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } });
  return mime ? { mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' } : null;
}

function makeView(materials, size, forceFallback, level) {
  const cv = document.createElement('canvas'); cv.width = size[0]; cv.height = size[1];
  const view = !forceFallback && LabGL.supported() ? new LabGL(cv, { level }) : new Canvas2DView(cv);
  view.setSlots(materials); return { cv, view };
}
/** Подпись на кадре. info = { collection, title, code, url, note } */
export function drawLabel(g, W, H, info, alpha = 1) {
  const u = W / 720, pad = 38 * u;
  g.save(); g.globalAlpha = alpha;
  const grad = g.createLinearGradient(0, H * 0.72, 0, H); grad.addColorStop(0, 'rgba(8,8,9,0)'); grad.addColorStop(1, 'rgba(8,8,9,.82)'); g.fillStyle = grad; g.fillRect(0, H * 0.72, W, H * 0.28);
  g.fillStyle = 'rgba(255,255,255,.82)'; g.font = `500 ${15 * u}px Inter, Arial, sans-serif`; g.textBaseline = 'alphabetic';
  if (g.letterSpacing !== undefined) g.letterSpacing = `${3 * u}px`;
  g.fillText('ITALON X2 — MATERIAL LAB', pad, pad + 14 * u);
  if (g.letterSpacing !== undefined) g.letterSpacing = '0px';
  g.fillStyle = '#fff'; g.font = `400 ${44 * u}px "Noto Serif", Georgia, serif`; g.fillText(info.title, pad, H - pad - 62 * u);
  g.fillStyle = 'rgba(255,255,255,.72)'; g.font = `400 ${19 * u}px Inter, Arial, sans-serif`; g.fillText(`${info.collection} · арт. ${info.code}`, pad, H - pad - 28 * u);
  g.fillStyle = 'rgba(217,185,138,.98)'; g.fillText(info.url, pad, H - pad + 2 * u);
  g.restore();
}
const toBlob = (cv, type, q) => new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('Не удалось сохранить изображение'))), type, q));

/** materials — две записи [основа, вторая сторона]; state.a/b — номера этих ячеек. */
export async function exportStill({ materials, state, size, info, forceFallback = false, level = 0, type = 'image/jpeg', quality = 0.92 }) {
  const { cv, view } = makeView(materials, size, forceFallback, level);
  const st = JSON.parse(JSON.stringify(state)); st.q = view.fallback ? 2 : 0;
  view.render(st, { cssWidth: size[0] * 0.8, time: 0 });
  const out = document.createElement('canvas'); out.width = size[0]; out.height = size[1];
  const g = out.getContext('2d'); g.fillStyle = '#08080a'; g.fillRect(0, 0, size[0], size[1]); g.drawImage(cv, 0, 0); drawLabel(g, size[0], size[1], info);
  const blob = await toBlob(out, type, quality); view.dispose?.(); return { blob, width: size[0], height: size[1] };
}

/** Видео: duration секунд реального времени. onProgress(0..1). signal — AbortSignal. Возвращает { blob, mime, ext }. */
export async function exportVideo({ materials, state, size, info, duration = 7, fps = 30, forceFallback = false, level = 1, onProgress, signal }) {
  const sup = videoSupport(); if (!sup) throw new Error('Этот браузер не умеет сохранять видео из холста');
  const { cv, view } = makeView(materials, size, forceFallback, level);
  const out = document.createElement('canvas'); out.width = size[0]; out.height = size[1];
  const g = out.getContext('2d'), stream = out.captureStream(fps), chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: sup.mime, videoBitsPerSecond: 5_000_000 });
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise((res, rej) => { rec.onstop = res; rec.onerror = e => rej(e.error || new Error('Ошибка записи')); });
  const aspect = size[0] / size[1], t0 = performance.now(); let raf, aborted = false;
  rec.start(250);
  await new Promise((resolve) => {
    const tick = () => {
      if (signal?.aborted) { aborted = true; return resolve(); }
      const t = (performance.now() - t0) / 1000;
      if (t >= duration) return resolve();
      const st = choreograph(state, t, { duration, aspect, from: state.a, to: state.b });
      st.q = view.fallback ? 2 : (level >= 3 ? 2 : level >= 2 ? 1 : 0);
      view.render(st, { cssWidth: size[0] * 0.8, time: t }); g.drawImage(cv, 0, 0);
      const fade = Math.min(1, t / 0.6) * Math.min(1, (duration - t) / 0.4 + 0.2); drawLabel(g, size[0], size[1], info, fade);
      onProgress?.(t / duration); raf = requestAnimationFrame(tick);
    };
    tick();
  });
  cancelAnimationFrame(raf); if (rec.state !== 'inactive') rec.stop(); await done; stream.getTracks().forEach(t => t.stop()); view.dispose?.();
  if (aborted) throw Object.assign(new Error('Остановлено'), { aborted: true });
  onProgress?.(1);
  return { blob: new Blob(chunks, { type: sup.mime.split(';')[0] }), mime: sup.mime, ext: sup.ext };
}
