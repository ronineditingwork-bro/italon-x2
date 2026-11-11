import test from 'node:test';
import assert from 'node:assert/strict';
import { products,productMap,calculateCart,calculateArea,lineFor } from '../src/catalog.mjs';
import { handleApi } from '../worker/api.mjs';
import { localDatabase } from '../scripts/sqlite-adapter.mjs';

test('catalog preserves sections and deduplicates the shared transport crate',()=>{
 assert.equal(products.length,1202);assert.equal(products.filter(p=>p.section==='x2').length,65);assert.equal(products.filter(p=>p.section==='italon').length,928);assert.equal(products.filter(p=>p.section==='coliseum').length,148);assert.equal(products.filter(p=>p.section==='contract').length,61);
 assert.equal(products.filter(p=>p.code==='450080000001').length,1);assert.ok(products.every(p=>p.canOrder));
 assert.equal(productMap.get('450080000001').priceKopecks,1473500);
});
test('X2 calculation: минимальный заказ — одна коробка, паллетой покупать не обязательно',()=>{
 const result=calculateArea('610010001539',20,10);
 assert.equal(result.packs,31);assert.equal(result.quantity,22.32);assert.equal(result.pieces,62);assert.equal(result.totalKopecks,15199920);assert.equal(result.minimumApplied,false);
 const p=productMap.get('610010001539');
 assert.equal(p.minPacks,1);assert.equal(p.minimum,'1 коробка');
 const one=lineFor('610010001539',1);
 assert.equal(one.packs,1);assert.equal(one.quantity,0.72);assert.equal(one.totalKopecks,490320);
 // нигде в минимальном заказе не осталось паллеты
 assert.equal(products.filter(x=>/паллет/i.test(x.minimum)).length,0);
});
test('piece-priced mosaic bills pieces, not the area of the box',()=>{
 const result=lineFor('620110000263',1);
 assert.equal(result.quantity,11);assert.equal(result.totalKopecks,2225300);assert.equal(result.area,.858);
 const missingArea=lineFor('600080000350',1);
 assert.equal(missingArea.quantity,6);assert.equal(missingArea.totalKopecks,1261800);
});
test('exact package boundary stays exact but a slightly larger area rounds up',()=>{
 const p=productMap.get('600180000132');
 assert.equal(calculateArea(p.code,3.336,0).packs,1);
 assert.equal(calculateArea(p.code,3.33601,0).packs,2);
});
test('rejects invalid quantities and duplicate, unrecognized or oversized inputs',()=>{
 assert.throws(()=>lineFor('610010001539',0));assert.throws(()=>lineFor('610010001539',1.5));assert.throws(()=>lineFor('620110000263',1.5));assert.throws(()=>lineFor('620110000263',10000));
 assert.throws(()=>calculateArea('610010001539',-1,10));assert.throws(()=>calculateArea('610010001539',Infinity,10));assert.throws(()=>calculateArea('610010001539',20,90));
 assert.throws(()=>calculateCart([{code:'unknown',packs:1}]));assert.throws(()=>calculateCart([{code:'620110000263',packs:1},{code:'620110000263',packs:1}]));
});
test('cart API persists, isolates visitors, rejects stale writes and ignores forged prices',async()=>{
 const {DB,close}=localDatabase();
 try {
  const origin='https://italon-x2.ru';
  const get=async cookie=>handleApi(new Request(origin+'/api/cart',{headers:cookie?{Cookie:cookie}:{}}),{DB});
  const first=await get();assert.equal(first.status,200);const cookie=first.headers.get('set-cookie').split(';')[0];
  assert.ok(first.headers.get('set-cookie').includes('HttpOnly'));assert.ok(first.headers.get('set-cookie').includes('Secure'));
  assert.equal((await first.json()).lines.length,0);
  const put=body=>handleApi(new Request(origin+'/api/cart',{method:'PUT',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),{DB});
  const saved=await put({version:0,items:[{code:'620110000263',packs:1,priceKopecks:1}]});assert.equal(saved.status,200);
  const cart=await saved.json();assert.equal(cart.totalKopecks,2225300);assert.equal(cart.version,1);
  const restored=await (await get(cookie)).json();assert.equal(restored.lines[0].packs,1);assert.equal(restored.totalKopecks,2225300);
  const other=await (await get()).json();assert.equal(other.lines.length,0);
  const stale=await put({version:0,items:[]});assert.equal(stale.status,409);assert.equal((await stale.json()).cart.lines.length,1);
  const invalid=await put({version:1,items:[{code:'620110000263',packs:-1}]});assert.equal(invalid.status,400);
  const hostile=await handleApi(new Request(origin+'/api/cart',{method:'PUT',headers:{Cookie:cookie,Origin:'https://example.com','Content-Type':'application/json'},body:'{"version":1,"items":[]}'}),{DB});assert.equal(hostile.status,403);
  const cleared=await put({version:1,items:[]});assert.equal(cleared.status,200);assert.equal((await cleared.json()).totalKopecks,0);
 } finally {close();}
});

test('слэбы: продаются листами; к корзине сам добавляется транспортный ящик — один на каждые 18 листов', async () => {
  const { calculateCart, products } = await import('../src/catalog.mjs');
  const [a, b] = products.filter(p => p.format === '120X278' && p.canOrder);
  assert.equal(a.orderUnit, 'лист'); assert.equal(a.minimum, '1 лист');
  const crate = cart => cart.lines.find(l => l.code === '450080000001');
  for (const [sheets, crates] of [[1, 1], [18, 1], [19, 2], [36, 2], [37, 3]]) {
    const c = crate(calculateCart([{ code: a.code, packs: sheets }]));
    assert.deepEqual([c.packs, c.auto, c.sheets], [crates, true, sheets], `${sheets} листов`);
  }
  const mixed = calculateCart([{ code: a.code, packs: 10 }, { code: b.code, packs: 9 }, { code: '450080000001', packs: 5 }]);
  assert.equal(crate(mixed).packs, 2, 'ящик из корзины пересчитывается по листам'); assert.equal(mixed.lines.length, 3);
  assert.equal(mixed.totalKopecks, mixed.lines.reduce((s, l) => s + l.totalKopecks, 0), 'ящик входит в сумму КП');
  assert.equal(crate(calculateCart([{ code: products.find(p => p.format === '60X120' && p.canOrder).code, packs: 2 }])), undefined, 'без слэбов ящика нет');
});
