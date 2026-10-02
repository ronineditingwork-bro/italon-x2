import { products, productMap, priceInfo, calculateArea, calculateCart, MAX_PACKS } from './catalog.mjs';
import { collections, collectionMap, layingMethods, outdoorSpaces } from './scenes.mjs';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n = (value, max = 3) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: max }).format(value);
const money = value => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(value / 100);
const fmt = value => String(value).replace(/[XХ]/g, ' × ');
const normalize = s => s.toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[х×]/g,'x').replace(/\s+/g,' ').trim();
let activeSection = 'italon', page = 1, mode = 'area', toastTimer;
let cart = { lines: [], totalKopecks: 0, version: 0, priceInfo }, cartLoaded = false, cartPromise;
let cartQueue = Promise.resolve(), pending = 0, unsaved = null, exporting = false;
const PAGE_SIZE = 18;
function toast(text) { const element=$('#toast');element.textContent=text;element.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>element.classList.remove('show'),4200); }
function packLabel(p) { return p.boxed ? `${n(p.unitsPerPack)} ${p.unit} в коробке` : 'Поштучная продажа'; }
function minimumLabel(p) { return `Минимум: ${p.minimum}${p.minPacks > 1 && p.boxed ? ` · ${n(p.minPacks)} кор.` : ''}`; }
function productPhoto(p, place='catalog') {
  const image=p.image;
  if(!image)return `<div class="product-photo photo-${place} photo-missing"><span>${p.collectionId==='packaging'?'Транспортировочная упаковка':'Фото уточняется'}</span></div>`;
  const caption=image.kind==='collection'?'Пример коллекции':'';
  const alt=image.kind==='collection'?`Пример коллекции ${p.collection}; фотография конкретного артикула уточняется`:p.name;
  const picture=`<img src="${esc(image.src)}" alt="${esc(alt)}" width="${image.width}" height="${image.height}" loading="${place==='detail'?'eager':'lazy'}" decoding="async" data-product-image>`;
  const content=place==='catalog'?`<button type="button" class="product-photo-open" data-detail="${p.code}" aria-label="Открыть ${esc(p.name)}">${picture}</button>`:picture;
  return `<figure class="product-photo photo-${place} image-${image.kind}">${content}${caption&&place!=='cart'?`<figcaption>${caption}</figcaption>`:''}</figure>`;
}
document.addEventListener('error',event=>{
  const image=event.target;if(!image.matches?.('img[data-product-image]'))return;
  const placeholder=document.createElement('span');placeholder.className='photo-error';placeholder.textContent='Фото временно недоступно';
  image.closest('.product-photo')?.classList.add('photo-missing');image.replaceWith(placeholder);
},true);
document.addEventListener('error',event=>{
  const image=event.target;if(!image.matches?.('img[data-scene-image]'))return;
  const placeholder=document.createElement('span');placeholder.className='scene-error';placeholder.textContent='Изображение временно недоступно';
  image.replaceWith(placeholder);
},true);
function sceneImage(image,alt,eager=false) {
  return `<img src="${esc(image.src)}" alt="${esc(alt)}" width="${image.width}" height="${image.height}" loading="${eager?'eager':'lazy'}" decoding="async" data-scene-image>`;
}
function sceneContext(collection) { return collection.section==='x2'?'в экстерьере':'в интерьере'; }
function renderSpaces() {
  $('#space-list').innerHTML=outdoorSpaces.map(space=>{
    const collection=collectionMap.get(space.collectionId);
    if(!collection?.image)return '';
    return `<article class="space-card" data-space-id="${esc(space.id)}"><button type="button" class="space-photo" data-scene="${esc(collection.id)}" aria-label="Увеличить визуализацию: ${esc(space.label)}, ${esc(collection.label)}">${sceneImage(collection.image,`${space.label}: коллекция ${collection.label}`)}<span class="photo-enlarge">Увеличить</span></button><div class="space-card-copy"><h3>${esc(space.label)}</h3><p class="space-description">${esc(space.description)}</p><p class="space-material">${esc(collection.label)} <span>Керамогранит · 20 мм</span></p><button type="button" class="text-button" data-collection="${esc(collection.id)}" data-space="${esc(space.project)}">Смотреть товары коллекции</button></div></article>`;
  }).join('');
}
function updateCollectionSelection() {
  const selected=$('#collection-filter').value;
  $$('.collection-card').forEach(card=>{
    const active=card.dataset.collectionId===selected;card.classList.toggle('selected',active);
    card.querySelector('[data-collection]').setAttribute('aria-pressed',String(active));
  });
}
function updateCollectionScroll() {
  const rail=$('#collection-rail');
  $('[data-collection-scroll="-1"]').disabled=rail.scrollLeft<=1;
  $('[data-collection-scroll="1"]').disabled=rail.scrollLeft+rail.clientWidth>=rail.scrollWidth-1;
}
function renderCollections() {
  $('#collections-heading').textContent=activeSection==='x2'?'Коллекции в экстерьере':'Коллекции в интерьере';
  $('#collection-rail').innerHTML=collections.filter(c=>c.section===activeSection&&c.image).map(c=>`<article class="collection-card" data-collection-id="${esc(c.id)}"><button type="button" class="collection-photo" data-scene="${esc(c.id)}" aria-label="Увеличить изображение коллекции ${esc(c.label)}">${sceneImage(c.image,`Коллекция ${c.label} ${sceneContext(c)}`)}<span class="photo-enlarge">Увеличить</span></button><div class="collection-card-info"><h4>${esc(c.label)}</h4><button type="button" class="text-button" data-collection="${esc(c.id)}" aria-pressed="false">Смотреть товары</button></div></article>`).join('');
  $('#collection-rail').scrollLeft=0;updateCollectionSelection();window.requestAnimationFrame(updateCollectionScroll);
}
function chooseCollection(id) {
  const collection=collectionMap.get(id);if(!collection)return;
  if(activeSection!==collection.section)setSection(collection.section);
  $('#collection-filter').value=id;$('#catalog-search').value='';page=1;rebuildFormats();renderProducts();
  $('#scene-dialog').close();$('#product-dialog').close();$('#catalog-controls').scrollIntoView({behavior:'smooth',block:'start'});
}
function openScene(id,isLaying=false) {
  const item=isLaying?layingMethods[id]:collectionMap.get(id);if(!item?.image)return;
  const label=item.label;
  const context=isLaying?'СПОСОБ УКЛАДКИ X2':`КОЛЛЕКЦИЯ ${sceneContext(item).toLocaleUpperCase('ru-RU')}`;
  $('#scene-dialog-content').innerHTML=`<p class="eyebrow">${esc(context)}</p><h2 id="scene-dialog-heading">${esc(label)}</h2><figure class="scene-preview">${sceneImage(item.image,isLaying?item.alt:`Коллекция ${label} ${sceneContext(item)}`,true)}</figure>${isLaying?`<p class="scene-caption">${esc(item.caption)}</p><p class="scene-source">Фото из каталога Italon X2.</p>`:`${item.image.caption?`<p class="scene-caption">${esc(item.image.caption)}</p>`:''}<button type="button" class="button button-dark" data-collection="${esc(id)}">Смотреть товары коллекции</button>`}`;
  $('#scene-dialog').showModal();
}
function setOptions(select, values, allText) { select.innerHTML=`<option value="all">${allText}</option>`+values.map(([value,label])=>`<option value="${esc(value)}">${esc(label)}</option>`).join(''); }
function rebuildFilters() {
  const visible=products.filter(p=>p.section===activeSection);
  const collections=[...new Map(visible.map(p=>[p.collectionId,p.collection])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'ru'));
  setOptions($('#collection-filter'),collections,'Все коллекции');rebuildFormats();
}
function rebuildFormats() {
  const collection=$('#collection-filter').value;
  const values=[...new Set(products.filter(p=>p.section===activeSection&&(collection==='all'||p.collectionId===collection)).map(p=>p.format).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru',{numeric:true}));
  setOptions($('#format-filter'),values.map(x=>[x,fmt(x)]),'Все форматы');
}
function setSection(section) {
  if (!['italon','x2'].includes(section)) return;
  activeSection=section;page=1;$('#catalog-search').value='';rebuildFilters();
  $$('.section-tab').forEach(b=>{const on=b.dataset.section===section;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  renderCollections();renderProducts();
}
function renderProducts() {
  updateCollectionSelection();
  const collection=$('#collection-filter').value, format=$('#format-filter').value;
  const tokens=normalize($('#catalog-search').value).split(' ').filter(Boolean);
  const filtered=products.filter(p=>p.section===activeSection&&(collection==='all'||p.collectionId===collection)&&(format==='all'||p.format===format)&&tokens.every(t=>normalize(`${p.name} ${p.latin} ${p.code} ${p.collection} ${p.format}`).includes(t)));
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));page=Math.min(page,pages);
  $('#result-count').textContent=`Найдено: ${n(filtered.length,0)} позиций`;
  $('#product-grid').innerHTML=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE).map(p=>{
    const line=cart.lines.find(l=>l.code===p.code);
    return `<article class="product-card">${productPhoto(p)}<div class="product-top"><span>${esc(p.collection)}</span><span class="product-code">${p.code}</span></div><button type="button" class="product-name" data-detail="${p.code}">${esc(p.name)}</button><p class="product-finish">${esc(p.finish ? p.finish.toLocaleLowerCase('ru') : 'Транспортировочная упаковка')}${p.format?` · ${esc(fmt(p.format))}`:''}</p><div class="product-price">${money(p.priceKopecks)} <small>/ ${p.unit}</small></div><p class="product-pack">${esc(packLabel(p))}</p><p class="product-minimum">${esc(minimumLabel(p))}</p><div class="product-actions"><button type="button" class="button button-dark ${line?'in-cart':''}" data-add="${p.code}" ${p.canOrder?'':'disabled'}>${line?`В корзине · ${n(line.packs)} ${p.orderUnit}`:p.canOrder?'В корзину':'Уточнить упаковку'}</button>${p.unit==='м²'&&p.canOrder?`<button type="button" class="text-button" data-calculate="${p.code}">Рассчитать</button>`:`<button type="button" class="text-button" data-detail="${p.code}">Подробнее</button>`}</div></article>`;
  }).join('') || '<div class="empty-state"><strong>Таких материалов не найдено.</strong><p>Измените название или артикул, выберите другую коллекцию либо раздел.</p><button type="button" class="button button-outline" data-reset>Сбросить фильтры</button></div>';
  $('#pagination').innerHTML=filtered.length?`<button type="button" data-page="${page-1}" ${page===1?'disabled':''}>Назад</button><span>Страница ${page} из ${pages}</span><button type="button" data-page="${page+1}" ${page===pages?'disabled':''}>Далее</button>`:'';
}
function openDetail(code) {
  const p=productMap.get(code);if(!p)return;
  $('#product-details').innerHTML=`<p class="eyebrow">${esc(p.collection)}</p><h2 id="product-dialog-heading">${esc(p.name)}</h2><p class="product-code">Артикул ${p.code}</p>${productPhoto(p,'detail')}<dl class="detail-table">${[['Цена с НДС',`${money(p.priceKopecks)} / ${p.unit}`],['Формат',fmt(p.format)||'Транспортировочная упаковка'],['Поверхность',p.finish||'—'],['В одной коробке',p.boxed?`${n(p.unitsPerPack)} ${p.unit}${p.unit==='м²'&&p.piecesPerPack?` · ${n(p.piecesPerPack)} шт`:''}`:'Поштучная продажа'],['Минимальный заказ',`${p.minimum}${p.minPacks>1?` (${n(p.minPacks)} ${p.orderUnit})`:''}`],['Раздел',p.section==='x2'?'X2 · 20 мм':'Italon']].map(([a,b])=>`<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl><button type="button" class="button button-dark" data-detail-add="${p.code}" ${p.canOrder?'':'disabled'}>Добавить в корзину</button>${p.unit==='м²'&&p.canOrder?`<button type="button" class="button button-outline" data-calculate="${p.code}">Рассчитать количество</button>`:''}<p class="catalog-note">Цены по прайсу от 01.07.2026, склад Краснодар. Наличие, тон, калибр и сроки поставки уточняются.</p>`;
  const collection=collectionMap.get(p.collectionId);
  if(collection?.image)$('#product-details').insertAdjacentHTML('beforeend',`<div class="detail-collection"><h3>Коллекция ${sceneContext(collection)}</h3><button type="button" class="detail-scene" data-scene="${esc(collection.id)}" aria-label="Увеличить изображение коллекции ${esc(collection.label)}">${sceneImage(collection.image,`Коллекция ${collection.label} ${sceneContext(collection)}`)}<span>${esc(collection.label)}<small>Увеличить изображение</small></span></button></div>`);
  $('#product-dialog').showModal();
}
function showCartError(message) { $('#cart-error').hidden=false;$('#cart-error span').textContent=message; }
function setExportState() {
  const unavailable=!cartLoaded||!cart.lines.length||pending>0||!!unsaved||exporting;
  $('#download-quote').disabled=unavailable;
  $('#cart-status').textContent=pending?'Сохраняем корзину…':unsaved?'Есть несохранённые изменения.':cartLoaded?'Корзина сохранена.': $('#cart-error').hidden?'Загружаем корзину…':'Корзина временно недоступна.';
}
async function ensureCart(force=false) {
  if(cartLoaded&&!force)return cart;
  if(cartPromise)return cartPromise;
  cartPromise=(async()=>{
    const response=await fetch('/api/cart',{credentials:'same-origin',cache:'no-store'});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Не удалось загрузить корзину.');
    cart=data;cartLoaded=true;$('#cart-error').hidden=true;renderCart();renderProducts();return cart;
  })().catch(e=>{showCartError(e.message||'Нет связи с корзиной. Повторите попытку.');throw e;}).finally(()=>{cartPromise=null;setExportState();});
  return cartPromise;
}
function renderCart() {
  const shown=unsaved ? {...calculateCart(unsaved),version:cart.version} : cart;
  $$('.cart-count').forEach(el=>el.textContent=shown.lines.length);
  $('#cart-total').textContent=money(shown.totalKopecks);
  $('#cart-content').innerHTML=shown.lines.length?shown.lines.map(line=>{
    const p=line.product;
    return `<article class="cart-item"><div class="cart-item-top">${productPhoto(p,'cart')}<div class="cart-item-title"><h3>${esc(p.name)}</h3><p class="cart-item-meta">${p.code} · ${esc(p.collection)}${p.format?` · ${esc(fmt(p.format))}`:''}</p></div><button type="button" class="remove-item" data-remove="${p.code}" aria-label="Удалить ${esc(p.name)}">×</button></div><div class="cart-item-bottom"><div><label class="quantity-label" for="qty-${p.code}">Количество, ${p.orderUnit}</label><div class="quantity-control"><button type="button" data-quantity="${p.code}" data-step="-1" aria-label="Уменьшить количество ${esc(p.name)}" ${line.packs<=p.minPacks?'disabled':''}>−</button><input id="qty-${p.code}" type="number" inputmode="numeric" min="${p.minPacks}" max="${MAX_PACKS}" step="1" value="${line.packs}" data-qty="${p.code}"><button type="button" data-quantity="${p.code}" data-step="1" aria-label="Увеличить количество ${esc(p.name)}" ${line.packs>=MAX_PACKS?'disabled':''}>+</button></div></div><div class="cart-item-price"><strong>${money(line.totalKopecks)}</strong><small>${n(line.quantity)} ${p.unit} × ${money(p.priceKopecks)} / ${p.unit}</small></div></div><p class="cart-minimum">${esc(minimumLabel(p))} · ${esc(packLabel(p))}</p></article>`;
  }).join(''):'<div class="empty-state"><strong>Корзина пока пуста.</strong><p>Добавьте материалы из каталога или сохраните расчёт из калькулятора.</p><button type="button" class="button button-outline" data-continue>Выбрать материалы</button></div>';
  setExportState();
}
async function saveItems(items) {
  const response=await fetch('/api/cart',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:cart.version,items})});
  const data=await response.json();
  if(!response.ok){
    if(response.status===409&&data.cart){cart=data.cart;unsaved=null;renderCart();renderProducts();}
    else {unsaved=items;renderCart();}
    throw new Error(data.error||'Изменения не сохранены. Повторите попытку.');
  }
  cart=data;unsaved=null;cartLoaded=true;$('#cart-error').hidden=true;renderCart();renderProducts();
}
function mutateCart(change, successText) {
  pending++;setExportState();
  cartQueue=cartQueue.then(async()=>{
    await ensureCart();
    const current=unsaved||cart.lines.map(({code,packs})=>({code,packs}));
    const next=change(current.map(x=>({...x})));
    calculateCart(next);
    try {await saveItems(next);if(successText)toast(successText);}
    catch(e){if(!unsaved&&!(e.message||'').includes('другой вкладке')){unsaved=next;renderCart();}throw e;}
  }).catch(e=>{showCartError(e.message||'Не удалось сохранить корзину.');toast(e.message||'Не удалось сохранить корзину.');})
    .finally(()=>{pending--;setExportState();});
  return cartQueue;
}
function addProduct(code,packs) {
  const p=productMap.get(code);if(!p?.canOrder)return;
  return mutateCart(items=>{const old=items.find(x=>x.code===code);if(old)old.packs+=packs||1;else items.push({code,packs:packs||p.minPacks});return items;},'Материал добавлен в корзину');
}
async function openCart() { if(!$('#cart-dialog').open)$('#cart-dialog').showModal();renderCart();try{await ensureCart();}catch{} }
function updateCalc() {
  try {
    const area=mode==='area'?Number($('#calc-area').value):Number($('#calc-length').value)*Number($('#calc-width').value);
    if(mode==='dimensions'&&(!Number($('#calc-length').value)||!Number($('#calc-width').value)||Number($('#calc-length').value)<=0||Number($('#calc-width').value)<=0||Number($('#calc-length').value)>1000||Number($('#calc-width').value)>1000))throw new Error('Укажите положительные размеры до 1 000 м.');
    const result=calculateArea($('#calc-product').value,area,Number($('#calc-reserve').value));
    $('#calc-result').innerHTML=`<strong>${n(result.packs)} ${result.product.orderUnit} · ${n(result.quantity)} м²</strong><dl><div><dt>Сумма с НДС</dt><dd>${money(result.totalKopecks)}</dd></div><div><dt>С учётом запаса</dt><dd>${n(result.target)} м²</dd></div><div><dt>Плит</dt><dd>${n(result.pieces)}</dd></div></dl>${result.minimumApplied?`<p>Учтён минимальный заказ: ${esc(result.product.minimum)}.</p>`:''}`;
    $('#calc-error').hidden=true;$('#calc-add').disabled=false;return result;
  } catch(e){$('#calc-result').innerHTML='<strong>—</strong>';$('#calc-error').textContent=e.message;$('#calc-error').hidden=false;$('#calc-add').disabled=true;return null;}
}
function chooseForCalc(code) {
  const p=productMap.get(code);if(!p||p.unit!=='м²'||!p.canOrder)return;
  $('#calc-product').value=code;updateCalc();$('#product-dialog').close();$('#calculator').scrollIntoView({behavior:'smooth'});
}
function download(bytes,name,type) { const url=URL.createObjectURL(new Blob([bytes],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000); }
document.addEventListener('click',event=>{
  const target=event.target.closest('button,a');if(!target)return;
  if(target.dataset.section){setSection(target.dataset.section);return;}
  if(target.dataset.scene){openScene(target.dataset.scene);return;}
  if(target.dataset.laying){openScene(target.dataset.laying,true);return;}
  if(target.dataset.collection){if(target.dataset.space)$('#quote-project').value=target.dataset.space;chooseCollection(target.dataset.collection);return;}
  if(target.hasAttribute('data-collection-scroll')){const rail=$('#collection-rail');rail.scrollBy({left:Number(target.dataset.collectionScroll)*rail.clientWidth*.85,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return;}
  if(target.dataset.detail){openDetail(target.dataset.detail);return;}
  if(target.dataset.calculate){chooseForCalc(target.dataset.calculate);return;}
  if(target.dataset.add){if(cart.lines.some(l=>l.code===target.dataset.add))openCart();else addProduct(target.dataset.add);return;}
  if(target.dataset.detailAdd){addProduct(target.dataset.detailAdd);$('#product-dialog').close();return;}
  if(target.hasAttribute('data-reset')){$('#reset-filters').click();return;}
  if(target.hasAttribute('data-page')){page=Number(target.dataset.page);renderProducts();$('#catalog').scrollIntoView({behavior:'smooth'});return;}
  if(target.dataset.remove){mutateCart(items=>items.filter(x=>x.code!==target.dataset.remove),'Материал удалён из корзины');return;}
  if(target.dataset.quantity){mutateCart(items=>{const line=items.find(x=>x.code===target.dataset.quantity);if(line)line.packs=Math.max(productMap.get(line.code).minPacks,Math.min(MAX_PACKS,line.packs+Number(target.dataset.step)));return items;});return;}
  if(target.hasAttribute('data-continue')){$('#cart-dialog').close();$('#catalog').scrollIntoView({behavior:'smooth'});return;}
});
$('.cart-trigger').addEventListener('click',openCart);
$$('.dialog-close').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('#cart-content').addEventListener('change',event=>{
  const input=event.target.closest('[data-qty]');if(!input)return;
  const p=productMap.get(input.dataset.qty), value=Number(input.value);
  if(!Number.isSafeInteger(value)||value<p.minPacks||value>MAX_PACKS){toast(`Укажите целое количество от ${p.minPacks} до ${MAX_PACKS} ${p.orderUnit}`);renderCart();return;}
  mutateCart(items=>{const line=items.find(l=>l.code===p.code);if(line)line.packs=value;return items;});
});
$('#retry-cart').addEventListener('click',()=>{if(unsaved)mutateCart(()=>unsaved.map(x=>({...x})),'Корзина сохранена');else ensureCart(true).catch(()=>{});});
$('#catalog-search').addEventListener('input',()=>{page=1;renderProducts();});
$('#collection-filter').addEventListener('change',()=>{page=1;rebuildFormats();renderProducts();});
$('#format-filter').addEventListener('change',()=>{page=1;renderProducts();});
$('#reset-filters').addEventListener('click',()=>setSection(activeSection));
$('#collection-rail').addEventListener('scroll',updateCollectionScroll,{passive:true});
window.addEventListener('resize',updateCollectionScroll);
$('#count-italon').textContent=products.filter(p=>p.section==='italon').length;
$('#count-x2').textContent=products.filter(p=>p.section==='x2').length;
$('#calc-product').innerHTML=products.filter(p=>p.unit==='м²'&&p.canOrder).map(p=>`<option value="${p.code}">${esc(p.name)} · ${p.code}</option>`).join('');
$('#calc-product').value=products.find(p=>p.collectionId==='x2-magma'&&p.format==='60X120')?.code||$('#calc-product').value;
$('#calculator-form').noValidate=true;
$$('#calculator-form input,#calculator-form select').forEach(el=>el.addEventListener('input',updateCalc));
$$('[data-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.mode;$$('[data-mode]').forEach(b=>{const on=b===button;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});$('#area-fields').hidden=mode!=='area';$('#dimension-fields').hidden=mode!=='dimensions';updateCalc();}));
$('#calculator-form').addEventListener('submit',event=>{event.preventDefault();const result=updateCalc();if(result)addProduct(result.code,result.packs);});
$('#quote-form').addEventListener('submit',async event=>{
  event.preventDefault();if(pending||unsaved||exporting||!cart.lines.length)return;
  exporting=true;setExportState();$('#download-quote').textContent='Готовим PDF…';
  try {
    await ensureCart(true);if(!cart.lines.length)throw new Error('Добавьте товары в корзину.');
    const { createQuote }=await import('./quote.mjs');
    const fontResponse=await fetch('/fonts/Inter-Quote.ttf');if(!fontResponse.ok)throw new Error('Не удалось загрузить шрифт для PDF. Повторите попытку.');
    const quote=await createQuote(cart,{customer:$('#quote-customer').value,project:$('#quote-project').value,note:$('#quote-note').value},new Uint8Array(await fontResponse.arrayBuffer()));
    download(quote.bytes,quote.filename,'application/pdf');toast('Коммерческое предложение готово');
  }catch(e){showCartError(e.message||'Не удалось сформировать PDF. Корзина сохранена.');}
  finally{exporting=false;$('#download-quote').textContent='Скачать КП в PDF';setExportState();}
});
rebuildFilters();renderSpaces();renderCollections();renderProducts();updateCalc();renderCart();ensureCart().catch(()=>{});

// Keep structured browser actions on the same visible product and calculator state.
if(document.modelContext?.registerTool){
 const tools=[
  {name:'list_materials',title:'Материалы Italon и X2',description:'Read available materials, SKU, packaging and source price date.',inputSchema:{type:'object',properties:{section:{type:'string',enum:['italon','x2']},query:{type:'string',maxLength:100}},additionalProperties:false},annotations:{readOnlyHint:true},execute(input={}){if(Object.keys(input).some(k=>!['section','query'].includes(k))||(input.section&&!['italon','x2'].includes(input.section))||(input.query!==undefined&&(typeof input.query!=='string'||input.query.length>100)))throw new Error('Invalid filter');return {priceInfo,products:products.filter(p=>(!input.section||p.section===input.section)&&(!input.query||normalize(p.name+' '+p.code).includes(normalize(input.query)))).slice(0,50)};}},
  {name:'configure_area_calculation',title:'Рассчитать количество материала',description:'Stage a visible area calculation for a SKU. Does not change the cart or place an order.',inputSchema:{type:'object',properties:{code:{type:'string'},area:{type:'number',exclusiveMinimum:0,maximum:100000},reserve:{type:'number',enum:[0,5,10,15,20]}},required:['code','area','reserve'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||Object.keys(input).some(k=>!['code','area','reserve'].includes(k)))throw new Error('Invalid calculation');const result=calculateArea(input.code,input.area,input.reserve);$('[data-mode="area"]').click();$('#calc-product').value=input.code;$('#calc-area').value=input.area;$('#calc-reserve').value=input.reserve;updateCalc();$('#calculator').scrollIntoView();return result;}}
 ];
 for(const definition of tools){try{Promise.resolve(document.modelContext.registerTool(definition)).catch(()=>{});}catch{}}
}
