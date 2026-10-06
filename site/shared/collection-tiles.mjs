// Крупные карточки коллекций с асимметричным ритмом на сетке 12 колонок
// (индекс /collections/ и список коллекций на /x2/). Стили — css/pages/collections.css.
//
// Ряды: «пара» (7 + 5 колонок, крупная карточка попеременно слева и справа), «тройка» (4 + 4 + 4)
// и «четвёрка» (3 × 4). Фото небольшие (480–800 px), поэтому карточка попадает в крупную ячейку,
// только если её фото не растягивается больше ~1.3× (номинальные размеры ячеек — при контенте 1440).
import { esc, fmt, positions, collectionUrl } from './format.mjs';

const SLOTS = { L: [759, 662], M: [533, 662], T: [420, 525], Q: [307, 384] };
const MAX_SCALE = 1.32;
const fits = (c, slot) => !!c.image && Math.max(SLOTS[slot][0] / c.image.width, SLOTS[slot][1] / c.image.height) <= MAX_SCALE;

/** Раскладка: [{size: 'pair'|'trio'|'quad', cells: [{c, slot}]}], порядок данных по возможности сохраняется. */
export function packRows(list) {
  const queue = [...list];
  const rows = [];
  let bigLeft = true;
  let wantPair = true;
  const take = i => queue.splice(i, 1)[0];
  // хвост без пар: тройки и четвёрки попеременно, ровно до конца
  const tail = n => {
    for (let a = Math.floor(n / 3); a >= 0; a--) {
      const b = (n - 3 * a) / 4;
      if (Number.isInteger(b)) {
        const out = [];
        let x = a, y = b, three = a >= b;
        while (x || y) { if ((three && x) || !y) { out.push(3); x--; } else { out.push(4); y--; } three = !three; }
        return out;
      }
    }
    return null;
  };
  while (queue.length) {
    const rem = queue.length;
    if (wantPair && rem >= 2 && rem !== 3 && rem - 2 !== 1) {
      const i = queue.findIndex(c => fits(c, 'L'));
      const j = queue.findIndex((c, k) => k !== i && fits(c, 'M'));
      if (i >= 0 && j >= 0) {
        const big = queue[i], small = queue[j];
        queue.splice(Math.max(i, j), 1); queue.splice(Math.min(i, j), 1);
        rows.push({ size: 'pair', cells: bigLeft ? [{ c: big, slot: 'L' }, { c: small, slot: 'M' }] : [{ c: small, slot: 'M' }, { c: big, slot: 'L' }] });
        bigLeft = !bigLeft; wantPair = false;
        continue;
      }
    }
    wantPair = true;
    const canPairLater = queue.some(c => fits(c, 'L')) && queue.length >= 5;
    if (canPairLater) {
      const n = rem - 3 === 1 ? 4 : 3;
      rows.push({ size: n === 3 ? 'trio' : 'quad', cells: queue.splice(0, n).map(c => ({ c, slot: n === 3 ? 'T' : 'Q' })) });
      continue;
    }
    const plan = tail(rem) || (rem === 2 ? [2] : rem === 1 ? [1] : [3, ...(tail(rem - 3) || [rem - 3])]);
    for (const n of plan) {
      const cells = queue.splice(0, n);
      if (!cells.length) break;
      const slot = n === 4 ? 'Q' : 'T';
      rows.push({ size: n === 4 ? 'quad' : n === 3 ? 'trio' : 'duo', cells: cells.map(c => ({ c, slot })) });
    }
  }
  return rows;
}

const lineLabel = c => c.section === 'x2' ? 'X2 · улица, 20 мм' : 'Italon · интерьер';

/** Строка форматов: плиты (все — в крупной карточке, до трёх — в малой) или мозаика/декор. */
function formatsLine(c, full) {
  const plates = c.plateFormats.map(fmt);
  if (!plates.length) {
    const other = [...new Set(c.formats.map(f => f.split(' ')[0].toLocaleLowerCase('ru-RU')))];
    return other.join(', ');
  }
  const shown = full ? plates : plates.slice(0, 3);
  return `${shown.join(' · ')} см${plates.length > shown.length ? ` · ещё ${plates.length - shown.length}` : ''}`;
}

/** Карточка коллекции. slot: L | M | T | Q. */
export function collectionTile(ctx, c, { slot = 'T', n = 0, eager = false } = {}) {
  const big = slot === 'L' || slot === 'M';
  const alt = `Коллекция ${c.label} ${c.section === 'x2' ? 'в экстерьере' : 'в интерьере'}`;
  const img = c.image
    ? `<img src="${ctx.media(c.image.src)}" alt="${esc(alt)}" width="${c.image.width}" height="${c.image.height}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
    : '<span class="media-missing">Фото уточняется</span>';
  return `<a class="ctile ctile--${slot}" href="${collectionUrl(ctx.root, c.id)}" data-reveal data-line="${c.section}">
<span class="media ctile__media">${img}</span>
<span class="ctile__body">
<span class="ctile__top"><span class="ctile__num t-num">${String(n).padStart(2, '0')}</span><span class="ctile__line">${esc(c.finishes.slice(0, 3).join(' · ') || lineLabel(c))}</span></span>
<span class="ctile__name">${esc(c.label)}${c.latin.toLocaleLowerCase('ru-RU') !== c.label.toLocaleLowerCase('ru-RU') ? ` <span class="ctile__latin">${esc(c.latin)}</span>` : ''}</span>
<span class="ctile__meta"><span class="ctile__count">${positions(c.count)}</span><span class="ctile__formats">${esc(formatsLine(c, big))}</span></span>
</span></a>`;
}

/** Сетка карточек с ритмом рядов. */
export function collectionRows(ctx, list, { start = 1, eagerFirst = 0 } = {}) {
  let n = start - 1;
  return `<div class="ctiles">${packRows(list).map(row => `<div class="ctiles__row ctiles__row--${row.size}" data-reveal-group>${row.cells.map(({ c, slot }) => {
    n++;
    return collectionTile(ctx, c, { slot, n, eager: n - start < eagerFirst });
  }).join('')}</div>`).join('\n')}</div>`;
}
