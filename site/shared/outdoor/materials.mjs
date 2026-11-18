// X2 Outdoor Lab: материалы. Единственный источник — каталог сайта (позиции линии X2). Ничего не придумываем: форматы, артикулы, фото и цены берутся из каталога,
// сочетание «цвет + формат» существует только если в каталоге есть такой артикул.
import { parseFormat } from '../lab/catalog.mjs';
import { normalize, money, media } from '../format.mjs';

const PLATE = /^\d+(?:\.\d+)?X\d+(?:\.\d+)?$/;
const area = f => { const d = parseFormat(f); return d ? d[0] * d[1] : 0; };

const strip = s => s.replace(/\b\d+(?:[.,]\d+)?\s*[XХ]\s*\d+(?:[.,]\d+)?\b/gi, ' ').replace(/(^|[\s.])(?:РЕТ|RET)(?=[\s.]|$)/gi, ' ').replace(/(^|\s)[XХ]2(?=\s|$)/gi, ' ').replace(/(^|[\s.])\d+(?=[\s.]|$)/g, ' ');
const cap = s => s.toLocaleLowerCase('ru-RU').replace(/(^|[\s.-])(\p{L})/gu, (m, a, c) => a + c.toLocaleUpperCase('ru-RU'));
/** Цвет позиции без коллекции и размера: «МИЛ.СИЛЬВЕР 60X120 РЕТ Х2» и «МИЛЛЕНИУМ СИЛЬВЕР 60 РЕТ Х2» → «Сильвер». Сокращение коллекции (МИЛ., АВА.) определяется по началу её названия. */
export function colorOf(p) {
  const base = String(p.collection || '').toUpperCase().replace(/\s*[XХ]2$/i, '').trim();
  let s = strip(String(p.name || '').toUpperCase()).replace(/\s+/g, ' ').trim();
  if (base && (s.startsWith(base + ' ') || s.startsWith(base + '.'))) s = s.slice(base.length);
  else { const m = s.match(/^([А-ЯЁA-Z]{2,5})\./u); if (m && base.startsWith(m[1])) s = s.slice(m[0].length); }
  return cap(s.replace(/^[.\s]+|[.\s]+$/g, '').replace(/\.(?=\S)/g, '. ').replace(/\s+/g, ' '));
}
export const collectionLabel = c => cap(String(c || '').replace(/\s*[XХ]2$/i, '').trim());
/** Один цвет в разных форматах — одна позиция лаборатории. */
export const colorKey = p => `${p.collectionId}~${normalize(colorOf(p))}`;
export const outdoorName = p => `${collectionLabel(p.collection)} ${colorOf(p)}`.trim();

/** Плитки линии X2 для улицы: только плиты с фото (мозаика, «павлиний хвост» и «блокс» — не раскладываются как плита) → группы «цвет» с вариантами по форматам. */
export function buildMaterials(products, { root = './' } = {}) {
  const groups = new Map(), order = new Map();
  for (const p of products) {
    if (p.section !== 'x2' || !PLATE.test(String(p.format || '')) || !p.image?.src || !p.image.width) continue;
    const key = colorKey(p);
    if (!groups.has(key)) { groups.set(key, { key, collectionId: p.collectionId, collection: collectionLabel(p.collection), name: outdoorName(p), finish: String(p.finish || '').toLowerCase(), variants: {} }); order.set(key, order.size); }
    const g = groups.get(key), v = g.variants[p.format];
    const entry = { code: p.code, format: p.format, rawName: p.name, image: media(root, p.image.src), imgW: p.image.width, imgH: p.image.height, priceKopecks: p.priceKopecks || 0, unit: p.unit || 'м²', priceText: p.priceKopecks > 0 ? `${money(p.priceKopecks)} за ${p.unit || 'м²'}` : '', areaPerPack: p.areaPerPack || 0, piecesPerPack: p.piecesPerPack || 1, minPacks: p.minPacks || 1, canOrder: p.canOrder !== false, path: `/product/${p.code}/` };
    if (!v || (!v.canOrder && entry.canOrder)) g.variants[p.format] = entry;      // при дубле артикулов берём заказываемый
  }
  const list = [...groups.values()].map(g => {
    const formats = Object.keys(g.variants).sort((a, b) => area(b) - area(a));
    return { ...g, id: g.variants[formats[0]].code, formats, thumb: g.variants[formats[0]].image };
  });
  return list.sort((a, b) => order.get(a.key) - order.get(b.key));
}
export const findByCode = (materials, code) => { for (const m of materials) for (const f of m.formats) if (m.variants[f].code === code) return { material: m, format: f, variant: m.variants[f] }; return null; };
export const variantOf = (material, format) => material.variants[format] || material.variants[material.formats[0]];

/** Упаковки на площадь с запасом. Площадь — в м², None если не измерена: тогда ничего не считаем. */
export function packsFor(areaM2, variant, { waste = 0.1, coverage = 1 } = {}) {
  if (!(areaM2 > 0) || !(variant?.areaPerPack > 0)) return null;
  const need = areaM2 * coverage * (1 + waste);
  const packs = Math.max(variant.minPacks || 1, Math.ceil(need / variant.areaPerPack - 1e-9));
  const covered = packs * variant.areaPerPack;
  return { packs, need, covered, costKopecks: variant.unit === 'м²' && variant.priceKopecks > 0 ? Math.round(covered * variant.priceKopecks) : null };
}

/**
 * Подставить проверенные оригиналы текстур (data/lab-originals.json → public/data/lab-originals.json) вместо маленьких фото каталога.
 * У варианта появляется texture: { src, width, height, original: true }; для телефонов берётся уменьшенная копия, если она есть.
 * Фото каталога остаётся запасным вариантом: сочетание цвета и формата от этого не меняется.
 */
export function applyTextures(materials, manifest, { mobile = false, root = './' } = {}) {
  const items = manifest?.items || {};
  if (!Object.keys(items).length) return materials;
  return materials.map(m => {
    let touched = false; const variants = {};
    for (const f of m.formats) {
      const v = m.variants[f], it = items[v.code], o = it && mobile && it.mobile?.src ? it.mobile : it;
      if (o?.src && o.width > 0 && o.height > 0) { variants[f] = { ...v, texture: { src: media(root, o.src), width: o.width, height: o.height, original: true } }; touched = true; }
      else variants[f] = v;
    }
    return touched ? { ...m, variants } : m;
  });
}
/** Какой файл грузить как текстуру плитки: оригинал, если есть, иначе фото каталога. */
export const textureOf = v => v.texture || { src: v.image, width: v.imgW, height: v.imgH, original: false };
