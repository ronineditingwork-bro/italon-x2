// Размер изображения по заголовку файла (PNG, JPEG, WebP) без внешних библиотек — для проверки оригиналов лаборатории.
export function imageSize(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: 'png', width: (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, height: (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0 };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { type: 'jpeg', height: b[i + 5] << 8 | b[i + 6], width: b[i + 7] << 8 | b[i + 8] };
      i += 2 + (b[i + 2] << 8 | b[i + 3]);
    }
    return null;
  }
  const tag = (o, s) => [...s].every((c, k) => b[o + k] === c.charCodeAt(0));
  if (b.length >= 30 && tag(0, 'RIFF') && tag(8, 'WEBP')) {
    if (tag(12, 'VP8X')) return { type: 'webp', width: 1 + (b[24] | b[25] << 8 | b[26] << 16), height: 1 + (b[27] | b[28] << 8 | b[29] << 16) };
    if (tag(12, 'VP8L')) { const v = b[21] | b[22] << 8 | b[23] << 16 | b[24] << 24; return { type: 'webp', width: (v & 0x3fff) + 1, height: ((v >>> 14) & 0x3fff) + 1 }; }
    if (tag(12, 'VP8 ')) return { type: 'webp', width: (b[26] | b[27] << 8) & 0x3fff, height: (b[28] | b[29] << 8) & 0x3fff };
  }
  return null;
}
