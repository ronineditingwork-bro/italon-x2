// Браузерная часть подбора по изображению: чтение файла/картинки в пиксели ограниченного размера (одна и та же для каталога и для снимка посетителя).
export const MAX_SIDE = 320;

// source: Blob/File, ImageBitmap или HTMLImageElement. Возвращает ImageData уменьшенной копии (длинная сторона ≤ MAX_SIDE).
export async function imageDataFrom(source, { maxSide = MAX_SIDE, region } = {}) {
  const bmp = source instanceof Blob ? await createImageBitmap(source) : source;
  const sw = bmp.width || bmp.naturalWidth, sh = bmp.height || bmp.naturalHeight;
  const r = region || { x: 0, y: 0, w: sw, h: sh };                        // область исходного изображения (кадрирование)
  const k = Math.min(1, maxSide / Math.max(r.w, r.h));
  const w = Math.max(1, Math.round(r.w * k)), h = Math.max(1, Math.round(r.h * k));
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);                        // прозрачное → белое
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, w, h);
  if (bmp.close && source instanceof Blob) bmp.close();
  return ctx.getImageData(0, 0, w, h);
}
