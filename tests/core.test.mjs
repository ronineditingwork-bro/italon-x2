import test from 'node:test';
import assert from 'node:assert/strict';
import { products,productMap,calculateCart,calculateArea,lineFor } from '../src/catalog.mjs';
import { handleApi } from '../worker/api.mjs';
import { localDatabase } from '../scripts/sqlite-adapter.mjs';

test('catalog preserves sections and deduplicates the shared transport crate',()=>{
 assert.equal(products.length,993);assert.equal(products.filter(p=>p.section==='x2').length,65);assert.equal(products.filter(p=>p.section==='italon').length,928);
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
