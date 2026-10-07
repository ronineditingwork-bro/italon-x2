// Скидки в коммерческом предложении: считаются одинаково в браузере, PDF и на сервере.
// 1) По сумме заказа (ступени от дилерской таблицы); границы включаются в верхнюю ступень.
// 2) +2% за заполненные ФИО, телефон и адрес объекта (данные нужны для регистрации защиты заказа в DAS).
// Проценты складываются и применяются к сумме корзины с НДС.
export const VOLUME_TIERS = [
  { from: 1_000_000, percent: 10 },
  { from: 800_000, percent: 10 },
  { from: 500_000, percent: 8 },
  { from: 300_000, percent: 7 },
  { from: 200_000, percent: 5 },
  { from: 100_000, percent: 4 },
  { from: 50_000, percent: 2 },
];
// В таблице нет строки 400–500 тыс. ₽: для неё действует ставка предыдущей ступени (7%).
export const DATA_PERCENT = 2;

export const hasFullData = d =>
  (String(d.customer ?? '').match(/[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё.-]+/g) || []).length >= 2 &&
  String(d.phone ?? '').replace(/\D/g, '').length >= 10 &&
  String(d.address ?? '').trim().length >= 8 && /\d/.test(d.address);

export function volumePercent(totalKopecks) {
  const rub = totalKopecks / 100;
  return VOLUME_TIERS.find(t => rub >= t.from)?.percent ?? 0;
}

/** Ближайшая ступень выше текущей: { from, percent, remainingKopecks } либо null. */
export function nextTier(totalKopecks) {
  const rub = totalKopecks / 100, current = volumePercent(totalKopecks);
  const next = [...VOLUME_TIERS].reverse().find(t => t.from > rub && t.percent > current);
  return next ? { ...next, remainingKopecks: Math.round(next.from * 100 - totalKopecks) } : null;
}

export function quoteDiscount(details, totalKopecks) {
  const parts = [];
  const volume = volumePercent(totalKopecks);
  if (volume) parts.push({ key: 'volume', percent: volume, label: 'сумма заказа' });
  if (hasFullData(details)) parts.push({ key: 'data', percent: DATA_PERCENT, label: 'ФИО, телефон и адрес объекта' });
  const percent = parts.reduce((sum, r) => sum + r.percent, 0);
  const discountKopecks = Math.round(totalKopecks * percent / 100);
  return { parts, percent, discountKopecks, payableKopecks: totalKopecks - discountKopecks };
}
