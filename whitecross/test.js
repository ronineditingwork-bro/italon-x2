// node --test whitecross/
const test = require('node:test');
const assert = require('node:assert');
const { rubToWords, buildDoc } = require('./docs.js');
const seller = { name: 'ООО «Т»', short: 'Т', inn: '1', kpp: '2', ogrn: '3', address: 'Краснодар', phone: '+7', bank: 'Банк', bik: '4', ks: '5', account: '6', director: 'Д. Д.', vatRate: 22 };
const lines = [{ name: 'Смеситель <b>', art: 'XI1411CR', qty: 2, price: 18330, img: 'https://x/y.jpg' }];

test('rubToWords', () => {
  assert.strictEqual(rubToWords(36660), 'Тридцать шесть тысяч шестьсот шестьдесят рублей 00 копеек');
});

test('invoice has bank requisites, VAT and escaped names', () => {
  const h = buildDoc({ kind: 'invoice', seller, lines, no: 7, date: '2026-11-24', opts: { photos: true, arts: true } });
  assert.match(h, /Счёт на оплату № 7 от 24 ноября 2026/);
  assert.match(h, /БИК/);
  assert.match(h, /НДС \(22%\): 6\s610,82/);
  assert.match(h, /Смеситель &lt;b&gt;/);
  assert.match(h, /Главный бухгалтер/);
});

test('quote has no bank block and shows validity date', () => {
  const h = buildDoc({ kind: 'quote', seller, lines, no: 3, date: '2026-11-24', validDays: 14, opts: { photos: false } });
  assert.match(h, /Коммерческое предложение № 3 от 24 ноября 2026/);
  assert.doesNotMatch(h, /БИК/);
  assert.match(h, /действительно до 8 декабря 2026 г\. Цены/);
  assert.doesNotMatch(h, /<img/);
});
