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
test('X2 calculation respects pallet minimum and prices square metres',()=>{
 const result=calculateArea('610010001539',20,10);
 assert.equal(result.packs,36);assert.equal(result.quantity,25.92);assert.equal(result.pieces,72);assert.equal(result.totalKopecks,17651520);assert.equal(result.minimumApplied,true);
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
 assert.throws(()=>lineFor('610010001539',35));assert.throws(()=>lineFor('620110000263',1.5));assert.throws(()=>lineFor('620110000263',10000));
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
test('pool lab offers 60x120 porcelain for the bowl and X2 for the deck and coping',async()=>{
 const { OPTIONS }=await import('../src/pool-lab-model.mjs');
 assert.ok(OPTIONS.bowl.length>=10&&OPTIONS.bowl.every(p=>p.section==='italon'&&p.format==='60X120'&&p.image));
 assert.ok(OPTIONS.deck.length>=8&&OPTIONS.deck.every(p=>p.section==='x2'&&p.format==='60X120'&&p.image));
 assert.equal(new Set(OPTIONS.deck.map(p=>p.name)).size,OPTIONS.deck.length);
});
test('pool lab share link ignores unknown and out-of-range values',async()=>{
 const { parseState,stateHash,DEFAULT_STATE,OPTIONS }=await import('../src/pool-lab-model.mjs');
 const bowl=OPTIONS.bowl.at(-1).code;
 const state=parseState(`#scene=nope&light=night&bowl=${bowl}&deck=600010001804&length=12.5&width=999&reserve=7`);
 assert.equal(state.scene,DEFAULT_STATE.scene);assert.equal(state.light,'night');assert.equal(state.bowl,bowl);
 assert.equal(state.deck,DEFAULT_STATE.deck);assert.equal(state.length,12.5);assert.equal(state.width,DEFAULT_STATE.width);assert.equal(state.reserve,10);
 assert.deepEqual(parseState('#'+stateHash(state)),state);
});
test('pool lab areas follow the scene pool type and merge a shared SKU',async()=>{
 const { poolAreas,estimate,DEFAULT_STATE,SCENES }=await import('../src/pool-lab-model.mjs');
 assert.ok(Object.values(SCENES).every(s=>s.zones.includes(1)&&s.zones.includes(2)&&s.hotspots.deck&&s.hotspots.bowl));
 assert.deepEqual(poolAreas({length:8,width:4,depth:1.5,deckArea:60,type:'skimmer'}),{deck:60,bowl:68,coping:7.56});
 assert.equal(poolAreas({length:8,width:4,depth:1.5,deckArea:60,type:'overflow'}).coping,0);
 const overflow=Object.keys(SCENES).find(k=>SCENES[k].pool.type==='overflow');
 const result=estimate({...DEFAULT_STATE,scene:overflow,length:8,width:4,depth:1.5,coping:DEFAULT_STATE.deck});
 const deck=result.lines.find(l=>l.code===DEFAULT_STATE.deck);
 assert.equal(result.lines.length,2);assert.equal(result.areas.coping,0);assert.equal(deck.zoneArea,60);assert.deepEqual(deck.zones,['Терраса']);
 const skimmer=Object.keys(SCENES).find(k=>SCENES[k].pool.type==='skimmer');
 if(skimmer){const merged=estimate({...DEFAULT_STATE,scene:skimmer,length:8,width:4,depth:1.5,coping:DEFAULT_STATE.deck}).lines.find(l=>l.code===DEFAULT_STATE.deck);
  assert.equal(merged.zoneArea,67.56);assert.equal(merged.areaRequested,67.56);assert.deepEqual(merged.zones,['Терраса','Бортик']);}
 assert.equal(result.totalKopecks,result.lines.reduce((s,l)=>s+l.totalKopecks,0));
});
