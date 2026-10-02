import { Window } from 'happy-dom';
import { readFile,mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { handleApi } from '../worker/api.mjs';
import { localDatabase } from '../scripts/sqlite-adapter.mjs';
const win=new Window({url:'https://italon-x2.ru/',settings:{disableJavaScriptFileLoading:true,disableJavaScriptEvaluation:true,disableCSSFileLoading:true}});
const nativeTimeout=globalThis.setTimeout;
globalThis.setTimeout=(fn,ms,...args)=>{const timer=nativeTimeout(fn,ms,...args);if(ms>=1000)timer.unref();return timer;};
const html=await readFile(resolve(import.meta.dirname,'../public/index.html'),'utf8');win.document.write(html);
globalThis.window=win;globalThis.document=win.document;Object.defineProperty(globalThis,'navigator',{value:win.navigator,configurable:true});
if(!win.HTMLDialogElement.prototype.showModal)win.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
if(!win.HTMLDialogElement.prototype.close)win.HTMLDialogElement.prototype.close=function(){this.open=false;};
win.HTMLElement.prototype.scrollIntoView=function(){};
const {DB,close}=localDatabase();let cookie='',downloaded;
globalThis.fetch=async(url,options={})=>{
 if(url==='/fonts/Inter-Quote.ttf')return new Response(await readFile(resolve(import.meta.dirname,'../public/fonts/Inter-Quote.ttf')));
 const headers=new Headers(options.headers);if(cookie)headers.set('Cookie',cookie);if(options.method)headers.set('Origin','https://italon-x2.ru');
 const response=await handleApi(new Request(new URL(url,'https://italon-x2.ru'),{...options,headers}),{DB});
 if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return response;
};
URL.createObjectURL=blob=>{downloaded=blob;return 'blob:test-pdf';};URL.revokeObjectURL=()=>{};win.HTMLAnchorElement.prototype.click=function(){};
const $=s=>document.querySelector(s);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(predicate,label){for(let i=0;i<500;i++){if(predicate())return;await pause(10);}throw new Error('Timed out: '+label);}
try {
 await import('../src/app.mjs');await until(()=>$('#cart-status').textContent==='Корзина сохранена.','initial cart');
 assert.equal(document.querySelectorAll('.space-card img[data-scene-image]').length,3);
 for(const [id,collection,name,project] of [
  ['terrace','x2-millennium','МИЛЛЕНИУМ X2','Терраса'],
  ['garden','x2-magnetique','МАНЕТИК X2','Садовые дорожки'],
  ['pool','x2-fossil','ФОССИЛ Х2','Зона у бассейна']
 ]){
  const card=$(`[data-space-id="${id}"]`);const source=card.querySelector('img').getAttribute('src');
  card.querySelector('.space-photo').click();assert.equal($('#scene-dialog').open,true);
  assert.equal($('.scene-preview img').getAttribute('src'),source);$('#scene-dialog .dialog-close').click();
  card.querySelector('[data-collection]').click();assert.equal($('#collection-filter').value,collection);
  assert.equal($('.section-tab.active').dataset.section,'x2');assert.equal($('#quote-project').value,project);
  assert.ok(document.querySelectorAll('.product-card').length>0);
  assert.ok([...document.querySelectorAll('.product-top>span:first-child')].every(el=>el.textContent===name));
 }
 document.querySelector('.section-tab[data-section="italon"]').click();
 assert.equal(document.querySelectorAll('.collection-card').length,23);
 const primaScene=$('#collection-rail [data-scene="prima"]');
 const sceneSource=primaScene.querySelector('img').getAttribute('src');primaScene.click();
 assert.equal($('#scene-dialog').open,true);assert.equal($('.scene-preview img').getAttribute('src'),sceneSource);
 $('#scene-dialog [data-collection="prima"]').click();
 assert.equal($('#scene-dialog').open,false);assert.equal($('#collection-filter').value,'prima');
 assert.equal($('.collection-card.selected').dataset.collectionId,'prima');
 assert.ok([...document.querySelectorAll('.product-top>span:first-child')].every(el=>el.textContent==='ПРИМА'));
 $('#reset-filters').click();
 for(const method of ['grass','gravel','pedestals','adhesive']){
  const button=$(`[data-laying="${method}"]`);const source=button.querySelector('img').getAttribute('src');button.click();
  assert.equal($('#scene-dialog').open,true);assert.equal($('.scene-preview img').getAttribute('src'),source);
  assert.match($('.scene-source').textContent,/Italon X2/);$('#scene-dialog .dialog-close').click();
 }
 assert.equal(document.querySelectorAll('.product-card').length,18);assert.equal($('#count-italon').textContent,'928');
 assert.equal(document.querySelectorAll('.product-card img[data-product-image]').length,17);
 const photo=$('.product-photo-open[data-detail="600180000132"]');const photoSource=photo.querySelector('img').getAttribute('src');photo.click();
 assert.equal($('#product-dialog').open,true);assert.equal($('.photo-detail img').getAttribute('src'),photoSource);
 $('.photo-detail img').dispatchEvent(new win.Event('error'));
 assert.match($('.photo-detail').textContent,/Фото временно недоступно/);assert.ok($('[data-detail-add="600180000132"]'));
 $('#product-dialog .dialog-close').click();
 document.querySelector('.section-tab[data-section="x2"]').click();assert.match($('#result-count').textContent,/65/);
 assert.equal(document.querySelectorAll('.collection-card').length,19);assert.match($('#collections-heading').textContent,/экстерьере/);
 $('#catalog-search').value='несуществующий артикул';$('#catalog-search').dispatchEvent(new win.Event('input'));
 $('#collection-rail [data-collection="x2-aura"]').click();assert.equal($('#catalog-search').value,'');
 assert.equal($('#collection-filter').value,'x2-aura');assert.ok(document.querySelectorAll('.product-card').length>0);
 document.querySelector('.section-tab[data-section="italon"]').click();
 $('#catalog-search').value='620110000263';$('#catalog-search').dispatchEvent(new win.Event('input'));
 assert.equal(document.querySelectorAll('.product-card').length,1);$('[data-add="620110000263"]').click();
 await until(()=>$('.cart-count').textContent==='1','add mosaic');$('.cart-trigger').click();assert.equal($('#cart-dialog').open,true);
 assert.ok($('.cart-item img[data-product-image]'));assert.match($('.cart-item img').alt,/МОЗАИКА КРОСС/);
 const qty=$('[data-qty="620110000263"]');qty.value='2';qty.dispatchEvent(new win.Event('change',{bubbles:true}));
 await until(()=>$('#cart-total').textContent.includes('44'),'quantity update');assert.match($('#cart-total').textContent,/44\s506/);
 document.querySelector('.section-tab[data-section="x2"]').click();
 $('[data-calculate="610010001539"]').click();$('#calc-area').value='20';$('#calc-reserve').value='10';$('#calc-area').dispatchEvent(new win.Event('input'));
 assert.match($('#calc-result').textContent,/36 кор/);
 $('#calculator-form').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));
 await until(()=>$('.cart-count').textContent==='2','add calculation');
 $('[data-remove="620110000263"]').click();await until(()=>$('.cart-count').textContent==='1','remove mosaic');
 await until(()=>!$('#download-quote').disabled,'quote ready');
 $('#quote-customer').value='Проверка интерфейса';$('#quote-project').value='Терраса';
 $('#quote-form').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));
 await until(()=>!!downloaded,'PDF download');assert.equal(downloaded.type,'application/pdf');
 const buffer=Buffer.from(await downloaded.arrayBuffer());assert.equal(buffer.subarray(0,4).toString(),'%PDF');
 await mkdir(resolve(import.meta.dirname,'../test-results'),{recursive:true});await writeFile(resolve(import.meta.dirname,'../test-results/quote-from-ui.pdf'),buffer);
 console.log('PASS: three outdoor scene cards linked to their materials, 42 collection scenes, four installation photo viewers, product photos, cart, calculator and PDF download.');
}finally{close();await win.happyDOM.close();}
