// Журнальная мозаика «Вдохновения» (сборка и браузер): ритм рядов на сетке 12 колонок.
// Ряды: A — крупный кадр слева (7 колонок) + малый справа со сдвигом вниз; B — три кадра по 4 колонки
// (средний ниже); C — малый слева со сдвигом + крупный справа; «разворот» — кадр с подписью на всю строку.
// Крупным становится только кадр, который не растягивается больше ~1.3× (ширина ≥ 584 px).
const BIG_MIN_WIDTH = 584;
const CYCLE = ['A', 'B', 'C', 'B'];

const ratio = ({ w, h }, kind) => {
  const r = w / h;
  if (kind === 'feature') return `${w}/${h}`;
  if (kind === 'big') return r > 1.05 ? `${w}/${h}` : '1/1';
  if (kind === 'small') return '4/5';
  if (kind === 'half') return '4/3';
  return r > 1.05 ? '4/3' : r > 0.9 ? '1/1' : '4/5';
};

/**
 * items: [{w, h, feature}] в желаемом порядке.
 * Возвращает [{i, cls, ratio}] — индексы исходных элементов в порядке вывода и их раскладку.
 */
export function mosaic(items) {
  const queue = items.map((it, i) => ({ ...it, i }));
  const out = [];
  const put = (it, cls, kind) => out.push({ i: it.i, cls, ratio: ratio(it, kind) });
  let k = 0;
  while (queue.length) {
    if (queue[0].feature) { put(queue.shift(), 'm-feature', 'feature'); continue; }
    // отрезок обычных кадров до следующего разворота
    let seg = queue.findIndex(it => it.feature);
    if (seg < 0) seg = queue.length;
    let pat = CYCLE[k % CYCLE.length];
    if (seg === 1) { put(queue.shift(), 'm-solo', 'half'); continue; }
    if (seg === 2 || seg === 4) pat = pat === 'B' ? 'A' : pat;
    if (pat !== 'B') {
      const b = queue.slice(0, Math.min(seg, 4)).findIndex(it => it.w >= BIG_MIN_WIDTH);
      if (b >= 0) {
        const big = queue.splice(b, 1)[0];
        const small = queue.shift();
        if (pat === 'A') { put(big, 'm-big m-big--l', 'big'); put(small, 'm-small m-small--r', 'small'); }
        else { put(small, 'm-small m-small--l', 'small'); put(big, 'm-big m-big--r', 'big'); }
        k++;
        continue;
      }
      if (seg === 2 || seg === 4) { put(queue.shift(), 'm-half', 'half'); put(queue.shift(), 'm-half m-drop', 'half'); k++; continue; }
    }
    queue.splice(0, 3).forEach((it, n) => put(it, `m-third${n === 1 ? ' m-drop' : ''}${n === 0 ? ' m-third--first' : ''}`, 'third'));
    k++;
  }
  return out;
}
