// Скидка за заполненные данные для коммерческого предложения: считается одинаково в браузере, PDF и на сервере.
export const DISCOUNT_RULES = [
  { key: 'address', percent: 2, label: 'адрес объекта', ok: d => String(d.address ?? '').trim().length >= 8 && /\d/.test(d.address) },
  { key: 'phone', percent: 3, label: 'телефон', ok: d => String(d.phone ?? '').replace(/\D/g, '').length >= 10 },
  { key: 'name', percent: 3, label: 'ФИО', ok: d => (String(d.customer ?? '').match(/[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё.-]+/g) || []).length >= 2 },
  { key: 'design', percent: 3, label: 'дизайн-проект', ok: d => d.design === true || d.design === 'true' || d.design === '1' },
];

export function quoteDiscount(details, totalKopecks) {
  const parts = DISCOUNT_RULES.filter(r => r.ok(details));
  const percent = parts.reduce((sum, r) => sum + r.percent, 0);
  const discountKopecks = Math.round(totalKopecks * percent / 100);
  return { parts, percent, discountKopecks, payableKopecks: totalKopecks - discountKopecks };
}
