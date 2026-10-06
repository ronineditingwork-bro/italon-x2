import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const W=595.28,H=841.89,M=36,R=W-M;
// Реквизиты салона (те же, что на странице «Салон»).
const SALON={name:'Italon Experience',city:'Краснодар',address:'ул. Бабушкина, 248',phone:'+7 918 24 89 248',email:'italon@amanagroup.org',site:'italon-x2.ru',hours:'Пн—Пт 10:00—19:00, Сб—Вс 10:00—18:00'};
const colors={ink:rgb(.18,.22,.17),muted:rgb(.39,.43,.36),pale:rgb(.9,.92,.86),line:rgb(.81,.83,.78),stripe:rgb(.97,.97,.95)};
const number=(v,d=3)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(v).replace(/\u00a0|\u202f/g,' ');
const money=k=>new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}).format(k/100).replace(/\u00a0|\u202f/g,' ');
export async function createQuote(cart, details, fontBytes, options={}) {
  if(!cart?.lines?.length)throw new Error('Добавьте материалы в корзину.');
  const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
  const font=await doc.embedFont(fontBytes,{subset:true});
  const allowed=new Set(font.getCharacterSet());
  const clean=value=>[...String(value??'').normalize('NFC').replace(/[\u2010-\u2015]/g,'-').replace(/[\u00a0\u202f]/g,' ').replace(/[\x00-\x09\x0b-\x1f]/g,' ')].map(c=>c==='\n'||allowed.has(c.codePointAt(0))?c:'?').join('');
  const now=options.now||new Date();
  const date=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const id=options.quoteId||`${date.split('.').reverse().join('')}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;
  doc.setTitle(`Коммерческое предложение - ${SALON.name} ${SALON.city}, ${SALON.address}`);doc.setAuthor(`${SALON.name} ${SALON.city}`);doc.setCreationDate(now);doc.setModificationDate(now);
  // Картинки товаров: options.images — Map код → {bytes, format:'jpg'|'png'} (webp перед этим переводится в jpeg в браузере).
  const imageSource=options.images instanceof Map?options.images:new Map(Object.entries(options.images||{}));
  const embedded=new Map();
  async function embedImage(code){
    if(embedded.has(code))return embedded.get(code);
    const src=imageSource.get(code);let value=null;
    if(src?.bytes){try{value=src.format==='png'?await doc.embedPng(src.bytes):await doc.embedJpg(src.bytes);}catch{value=null;}}
    embedded.set(code,value);return value;
  }
  const THUMB={w:40,h:48};
  function drawThumb(image,x,top){
    const box={x,y:top-THUMB.h,width:THUMB.w,height:THUMB.h};
    page.drawRectangle({...box,color:rgb(1,1,1),borderColor:colors.line,borderWidth:.5});
    if(!image)return;
    const k=Math.min((THUMB.w-4)/image.width,(THUMB.h-4)/image.height);
    const w=image.width*k,h=image.height*k;
    page.drawImage(image,{x:x+(THUMB.w-w)/2,y:box.y+(THUMB.h-h)/2,width:w,height:h});
  }
  let page,y;
  const write=(text,x,baseline,size=10,color=colors.ink)=>page.drawText(clean(text),{x,y:baseline,font,size,color});
  const right=(text,rightX,baseline,size=10,color=colors.ink)=>{const s=clean(text);write(s,rightX-font.widthOfTextAtSize(s,size),baseline,size,color);};
  function wrap(text,width,size=10){
    const output=[];
    for(const paragraph of clean(text).split('\n')){
      let line='';
      for(const word of paragraph.split(/\s+/).filter(Boolean)){
        const candidate=line?line+' '+word:word;
        if(font.widthOfTextAtSize(candidate,size)<=width){line=candidate;continue;}
        if(line){output.push(line);line='';}
        let part='';
        for(const char of word){if(part&&font.widthOfTextAtSize(part+char,size)>width){output.push(part);part='';}part+=char;}
        line=part;
      }
      output.push(line);
    }
    return output;
  }
  function tableHeader(){
    page.drawRectangle({x:M,y:y-26,width:R-M,height:26,color:colors.pale});
    write('№',M+7,y-17,8.5);write('Материал / артикул',M+31,y-17,8.5);
    right('Количество',378,y-17,8.5);right('Цена / ед.',455,y-17,8.5);right('Сумма, руб.',R-7,y-17,8.5);y-=26;
  }
  function newPage(first=false,table=false){
    page=doc.addPage([W,H]);page.drawRectangle({x:0,y:H-7,width:W,height:7,color:colors.ink});
    write(SALON.name,M,H-53,23);
    write(`${SALON.city} · ${SALON.address}`,M,H-73,10.5,colors.muted);
    right(SALON.phone,R,H-47,10);right(SALON.email,R,H-61,9,colors.muted);right(SALON.site,R,H-74,9,colors.muted);
    page.drawLine({start:{x:M,y:H-90},end:{x:R,y:H-90},thickness:.5,color:colors.line});
    if(first){write('Коммерческое предложение',M,H-126,20);write(`№ ${id}`,M,H-150,10,colors.muted);right(`от ${date}`,R,H-150,10,colors.muted);y=H-178;}
    else{write(`Коммерческое предложение № ${id} / продолжение`,M,H-112,9,colors.muted);y=H-134;}
    if(table)tableHeader();
  }
  function paragraph(text,size=10,color=colors.ink,gap=15){
    for(const line of wrap(text,R-M,size)){
      if(y<85)newPage(false,false);
      write(line,M,y,size,color);y-=gap;
    }
  }
  newPage(true);
  if(details.phone?.trim()){paragraph(`Телефон: ${details.phone.trim().slice(0,30)}`,10);y-=5;}
  if(details.customer?.trim()){paragraph(`Получатель: ${details.customer.trim().slice(0,100)}`,10);y-=5;}
  if(details.project?.trim()){paragraph(`Объект: ${details.project.trim().slice(0,150)}`,10);y-=5;}
  paragraph('Цены с НДС. Прайс от 01.07.2026, склад Краснодар.',9,colors.muted,13);y-=19;
  tableHeader();
  for(let index=0;index<cart.lines.length;index++){
    const l=cart.lines[index],p=l.product;
    const thumb=await embedImage(p.code);const textX=thumb?M+78:M+31,textW=thumb?190:236;
    const nameLines=wrap(p.name,textW,9.6);
    const metaLines=wrap(`Арт. ${p.code}${p.format?' / '+p.format.replace(/[XХ]/g,'x'):''}`,textW,7.8);
    const quantityLines=wrap(`${number(l.quantity)} ${p.unit}${p.boxed?'\n'+number(l.packs)+' кор.':''}`,70,8.5);
    const rowHeight=Math.max(thumb?64:46,26+nameLines.length*12+metaLines.length*11,26+Math.max(quantityLines.length,2)*12);
    if(y-rowHeight<105)newPage(false,true);
    if(index%2===0)page.drawRectangle({x:M,y:y-rowHeight,width:R-M,height:rowHeight,color:colors.stripe});
    const top=y-19;write(String(index+1),M+7,top,8.5,colors.muted);
    if(thumb)drawThumb(thumb,M+29,y-8);
    nameLines.forEach((line,j)=>write(line,textX,top-j*12,9.6));
    metaLines.forEach((line,j)=>write(line,textX,top-nameLines.length*12-3-j*11,7.8,colors.muted));
    quantityLines.forEach((line,j)=>right(line,378,top-j*12,j?8:9,j?colors.muted:colors.ink));
    right(money(p.priceKopecks),455,top,9.6);right(`руб. / ${p.unit}`,455,top-12,7.8,colors.muted);
    let amountSize=10;while(font.widthOfTextAtSize(money(l.totalKopecks),amountSize)>98)amountSize-=.5;
    right(money(l.totalKopecks),R-7,top,amountSize);
    y-=rowHeight;page.drawLine({start:{x:M,y},end:{x:R,y},thickness:.5,color:colors.line});
  }
  y-=24;if(y<180)newPage(false,false);
  page.drawRectangle({x:302,y:y-66,width:R-302,height:66,color:colors.pale});
  write('ИТОГО С НДС',316,y-20,9,colors.muted);
  const totalText=money(cart.totalKopecks)+' руб.';let totalSize=23;
  while(font.widthOfTextAtSize(totalText,totalSize)>R-330)totalSize-=.5;
  right(totalText,R-14,y-49,totalSize);y-=92;
  paragraph('Условия предложения',10,colors.ink,17);
  paragraph('Количество рассчитано с учётом целых упаковок и минимального заказа (одна коробка). Наличие, тон, калибр и сроки поставки уточняются при подтверждении заказа. Доставка рассчитывается отдельно.',8.7,colors.muted,13);
  y-=15;paragraph('Салон',10,colors.ink,17);
  paragraph(`${SALON.name}, ${SALON.city}, ${SALON.address}`,9,colors.ink,14);
  paragraph(`${SALON.hours}`,9,colors.muted,14);
  paragraph(`Тел. ${SALON.phone} · ${SALON.email}`,9,colors.muted,14);
  if(details.note?.trim()){y-=15;paragraph('Комментарий',10,colors.ink,17);paragraph(details.note.trim().slice(0,500),9,colors.ink,14);}
  for(const [i,p] of doc.getPages().entries()){
    page=p;page.drawLine({start:{x:M,y:49},end:{x:R,y:49},thickness:.5,color:colors.line});
    write(`${SALON.name} · ${SALON.city}, ${SALON.address} · ${SALON.phone}`,M,33,8,colors.muted);
    right(`${i+1} / ${doc.getPageCount()}`,R,33,8,colors.muted);
  }
  return {bytes:await doc.save(),filename:`KP-Italon-Experience-${id}.pdf`,pageCount:doc.getPageCount(),id};
}
