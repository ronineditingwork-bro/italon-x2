// Салон в 3D: схематичная модель шоурума по планировке (Three.js r128, собирается вместе с сайтом, внешних запросов нет).
// Подключается по нажатию на странице /salon/: модуль и библиотека не грузятся, пока посетитель не запустил модель.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/* Plan coordinates are pixels of the ARCHICAD sheet rendered at 110 dpi: 1 px = 16.8 mm. */
const LOOP_T=72, WALK=78; // loop seconds, walking speed px/s (~1.3 m/s)
const SCRIPT=[
 ['A',[400,1205],[
   {go:[[687,1205],[687,1100],[687,1002]],tag:'enter'},
   {stay:2.8,look:[640,975],pose:'wave',tag:'greet'},
   {go:[[800,1015],[860,950],[860,700],[700,680],[580,640],[565,600]]},
   {stay:6.5,look:[440,600],pose:'look',tag:'expo'},
   {go:[[594,581]]},
   {stay:11,look:[768,560],act:'sit',tag:'sit'},
   {go:[[590,650],[800,690],[855,760],[855,935],[650,935]]},
   {stay:1.6,look:[650,850],pose:'take',tag:'atDesk'},
   {stay:2.2,look:[650,850],pose:'wave',hold:'folder'},
   {go:[[687,1002],[687,1100],[687,1205],[400,1205]],tag:'leave'},
   {until:'T'}
 ]],
 ['C',[697,838],[
   {until:['A','enter','e',-3.6],look:[697,950],act:'sit',pose:'type'},
   {go:[[765,845],[765,940],[640,975]]},
   {until:['A','greet','e'],look:[687,1002],pose:'talk',tag:'greet'},
   {stay:1.4,look:[855,780],pose:'point'},
   {go:[[765,940],[765,845],[697,838]]},
   {until:['A','atDesk','s',-3.0],look:[697,950],act:'sit',pose:'type'},
   {go:[[650,846]],hold:'folder'},
   {until:['A','atDesk','s'],look:[650,950],pose:'talk'},
   {stay:1.6,look:[650,950],pose:'give',tag:'handover'},
   {stay:1.8,look:[650,950],pose:'wave',hold:null},
   {go:[[697,838]]},
   {until:'T',look:[697,950],act:'sit',pose:'type'}
 ]],
 ['D',[555,520],[
   {until:['A','expo','s',-0.6],look:[440,520],pose:'look'},
   {until:['A','expo','e'],look:[440,540],pose:'show',hold:'sample',tag:'show'},
   {go:[[594,526]]},
   {until:['A','sit','e'],look:[768,526],act:'sit',pose:'present',tag:'meet'},
   {go:[[555,520]]},
   {until:'T',look:[440,520],pose:'look',hold:null}
 ]],
 ['E',[885,262],[
   {stay:1.2,look:[1000,262]},
   {stay:6,look:[1000,236],pose:'pull',tag:'pull1'},
   {go:[[800,238],[705,240],[662,266],[575,262],[505,300]]},
   {stay:2.4,look:[440,300],pose:'take',tag:'pick'},
   {go:[[575,262],[662,266],[705,240],[830,238],[845,1012],[687,1010],[687,1100],[687,1205],[705,1226]],hold:'box',tag:'carry'},
   {stay:1.8,look:[300,1300],tag:'wait'},
   {stay:1.8,look:[705,1300],pose:'give',tag:'give'},
   {stay:2.4,look:[1100,1300],pose:'wave',hold:null},
   {go:[[687,1205],[687,1100],[687,1002],[845,1012],[840,380],[885,340]]},
   {stay:6,look:[1000,314],pose:'pull',tag:'pull2'},
   {go:[[885,262]]},
   {until:'T',look:[1000,262]}
 ]],
 ['B',[870,1050],[
   {stay:2,look:[1000,1050],pose:'look'},
   {go:[[1000,1060]]},
   {stay:3,look:[1108,1050],pose:'look',tag:'desk'},
   {go:[[975,940],[1040,860]]},
   {stay:5.5,look:[1105,855],pose:'touch',tag:'fly'},
   {go:[[1070,800],[1070,740],[1040,680]]},
   {stay:3.5,look:[1108,665],pose:'look',tag:'triniti'},
   {go:[[975,640],[975,520],[1050,485]]},
   {stay:4,look:[1108,485],pose:'touch',tag:'cube'},
   {go:[[980,470],[830,450],[830,160],[1060,155],[1150,172]]},
   {stay:3.5,look:[1150,130],pose:'look',tag:'deluxe'},
   {go:[[1290,175],[1350,232]]},
   {stay:6,look:[1440,232],pose:'look',tag:'x2'},
   {go:[[1290,175],[1060,155],[830,160],[830,700],[870,1050]]},
   {until:'T',look:[1000,1050]}
 ]],
 ['G',[1395,385],[
   {until:['B','x2','s',-1.6],look:[1300,330],pose:'look'},
   {go:[[1405,272]]},
   {until:['B','x2','e'],look:[1350,232],pose:'talk',tag:'x2'},
   {go:[[1395,385]]},
   {until:'T',look:[1300,330]}
 ]],
 ['F',[470,1063],[{until:'T',look:[498,1032],act:'sit',pose:'read',hold:'book'}]]
];
function compileScript(script,T,speed){
  const tags={},tracks={};
  const res=u=>{if(u==='T')return T;const v=tags[u[0]][u[1]];return v[u[2]]+(u[3]||0);};
  for(const [id,start,steps] of script){
    tags[id]={};let t=0,x=start[0],y=start[1],hold=null;
    let cur={t:0,x,y,hold:null};const keys=[cur];
    for(const s of steps){
      if('hold' in s)hold=s.hold;
      if(s.go){
        const t0=t;cur.hold=hold;
        for(const p of s.go){t+=Math.hypot(p[0]-x,p[1]-y)/speed;x=p[0];y=p[1];cur={t,x,y,hold};keys.push(cur);}
        if(s.tag)tags[id][s.tag]={s:t0,e:t};
      }else{
        let d=s.stay!=null?s.stay:res(s.until)-t;
        if(d<0){console.warn('timeline overlap',id,s.tag||'',d.toFixed(2));d=0;}
        Object.assign(cur,{look:s.look,act:s.act,pose:s.pose,hold});
        if(s.tag)tags[id][s.tag]={s:t,e:t+d};
        t+=d;cur={t,x,y,hold};keys.push(cur);
      }
    }
    tags[id].end=t;tracks[id]=keys;
  }
  return {tracks,tags};
}

export function startShowroom(root) {
  const $ = id => root.querySelector('[data-sh="' + id + '"]');
const ACCENT=0xFF4949, BG=0xECECEC;
const canvas=$('stage');
const coarse=window.matchMedia('(pointer: coarse)').matches||window.innerWidth<700;
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true});}
catch(e){$('err').hidden=false;return null;}
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,coarse?1.6:2));
renderer.setClearColor(BG,1);
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.08;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const maxAniso=renderer.capabilities.getMaxAnisotropy();
const scene=new THREE.Scene();scene.background=new THREE.Color(BG);

/* ---------- plan → world ---------- */
const S=0.0168,CX=951,CY=628;
const wx=p=>(p-CX)*S, wz=p=>(p-CY)*S;
const FL=0.05;

/* ---------- procedural ceramic textures ---------- */
function rngf(s){return()=>{s=(s*16807)%2147483647;return(s-1)/2147483646;};}
const fbm=(function(){const r=rngf(12345),n=256,g=new Float32Array(n*n);for(let i=0;i<n*n;i++)g[i]=r();
  function v(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),w=yf*yf*(3-2*yf);
    const x0=xi&255,x1=(xi+1)&255,y0=(yi&255)*n,y1=((yi+1)&255)*n;const a=g[y0+x0]+(g[y0+x1]-g[y0+x0])*u,b=g[y1+x0]+(g[y1+x1]-g[y1+x0])*u;return a+(b-a)*w;}
  return(x,y,o)=>{let s=0,a=.5,f=1,t=0;for(let i=0;i<o;i++){s+=v(x*f,y*f)*a;t+=a;a*=.5;f*=2.03;}return s/t;};})();
function makeTile(kind,cols,rows,seed){
  const SZ=256,c=document.createElement('canvas');c.width=c.height=SZ;
  const ctx=c.getContext('2d'),img=ctx.createImageData(SZ,SZ),d=img.data,r=rngf(seed);
  const cw=SZ/cols,ch=SZ/rows,offs=[];for(let i=0;i<(cols+1)*(rows+1);i++)offs.push([r()*700,r()*700,r()]);
  for(let y=0;y<SZ;y++)for(let x=0;x<SZ;x++){
    const cy=Math.floor(y/ch),shift=(kind==='wood'&&cy%2)?cw*.5:0,cx=Math.floor((x+shift)/cw);
    const o=offs[(cy*(cols+1)+cx)%offs.length],X=x+o[0],Y=y+o[1];let R,G,B;
    if(kind==='marble'||kind==='nero'||kind==='warm'){
      const n=fbm(X/55,Y/55,4),t=Math.sin((X*.7+Y*.35)/38+n*9),v1=Math.pow(1-Math.abs(t),9);
      const n2=fbm(X/18,Y/18,3),t2=Math.sin((X*.2-Y*.9)/22+n2*6),v2=Math.pow(1-Math.abs(t2),16)*.5;
      if(kind==='marble'){const b=241+(n-.5)*10;R=b-v1*52-v2*38;G=b-v1*58-v2*42;B=b-v1*70-v2*50;}
      else if(kind==='warm'){const b=232+(n-.5)*12;R=b-v1*40-v2*25;G=b-6-v1*52-v2*32;B=b-18-v1*66-v2*40;}
      else{const b=34+(n-.5)*16;R=b+v1*165+v2*80;G=b+v1*165+v2*80;B=b+v1*170+v2*86;}
    }else if(kind==='stone'){
      const n=fbm(X/40,Y/40,4),band=Math.sin(Y/6+n*4)*5,sp=r()<.03?-22:0;R=209+(n-.5)*34+band+sp;G=196+(n-.5)*32+band+sp;B=175+(n-.5)*28+band+sp;
    }else if(kind==='wood'){
      const n=fbm(X/50,Y/14,4),gr=.5+.5*Math.sin((Y+n*40)/2.6),tone=o[2]*.16,k=.83+.17*gr;R=(150+tone*120)*k;G=(108+tone*80)*k;B=(72+tone*48)*k;
    }else{
      const base=kind==='floor'?222:kind==='dark'?112:kind==='x2'?150:160,amp=kind==='floor'?14:30;
      const n=fbm(X/30,Y/30,5),m=fbm(X/6,Y/6,2),pore=(kind!=='floor'&&r()<.005)?-40:0,v=base+(n-.5)*amp+(m-.5)*10+pore;R=v+3;G=v+1;B=v-2;
    }
    const i=(y*SZ+x)*4;d[i]=R;d[i+1]=G;d[i+2]=B;d[i+3]=255;
  }
  ctx.putImageData(img,0,0);
  ctx.strokeStyle=kind==='nero'?'rgba(10,10,12,.85)':kind==='wood'?'rgba(60,38,22,.55)':'rgba(120,118,112,.5)';
  ctx.lineWidth=kind==='floor'||kind==='x2'?2:1.5;ctx.beginPath();
  for(let j=0;j<=rows;j++){ctx.moveTo(0,j*ch);ctx.lineTo(SZ,j*ch);}
  for(let j=0;j<rows;j++){const sh=(kind==='wood'&&j%2)?cw*.5:0;for(let i=0;i<=cols+1;i++){const xx=i*cw-sh;ctx.moveTo(xx,j*ch);ctx.lineTo(xx,(j+1)*ch);}}
  ctx.stroke();
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=maxAniso;return t;
}
const TX={marble:makeTile('marble',2,2,11),marbleBig:makeTile('marble',1,2,21),warm:makeTile('warm',1,2,23),nero:makeTile('nero',1,2,31),
  stone:makeTile('stone',2,2,41),concrete:makeTile('concrete',2,4,51),wood:makeTile('wood',2,6,61),floor:makeTile('floor',1,1,71),
  dark:makeTile('dark',2,2,81),x2:makeTile('x2',1,1,91)};
function tileMat(tex,rx=1,ry=1,rough=.45){const t=tex.clone();t.needsUpdate=true;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rx,ry);
  return new THREE.MeshStandardMaterial({map:t,roughness:rough});}

/* ---------- text textures ---------- */
const redraws=[];
function textTex(draw,W,H){const c=document.createElement('canvas');c.width=W;c.height=H;const tex=new THREE.CanvasTexture(c);
  tex.encoding=THREE.sRGBEncoding;tex.anisotropy=maxAniso;const f=()=>{const g=c.getContext('2d');g.clearRect(0,0,W,H);draw(g,W,H);tex.needsUpdate=true;};f();redraws.push(f);return tex;}
function logoTex(fg,W=512,H=128){return textTex((g,W,H)=>{g.font=`700 ${Math.round(H*.42)}px Inter,"Arial Black",Arial,sans-serif`;g.textBaseline='middle';
  const a='ITALON',b=' X2',wa=g.measureText(a).width,wb=g.measureText(b).width,x=(W-wa-wb)/2;g.fillStyle=fg;g.fillText(a,x,H*.53);g.fillStyle='#FF4949';g.fillText(b,x+wa,H*.53);},W,H);}
function wordTex(word,fg,W=512,H=128,weight=600){return textTex((g,W,H)=>{g.font=`${weight} ${Math.round(H*.4)}px Inter,"Arial Black",Arial,sans-serif`;
  g.textBaseline='middle';g.textAlign='center';g.fillStyle=fg;g.fillText(word,W/2,H*.53);},W,H);}
if(document.fonts&&document.fonts.load){Promise.all([document.fonts.load('700 40px Inter'),document.fonts.load('600 40px Inter')]).then(()=>redraws.forEach(f=>f())).catch(()=>{});}

/* ---------- materials & helpers ---------- */
const std=(c,r=.6,m=0,o={})=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:r,metalness:m},o));
const M={
  wall:std(0xf5f4f1,.85),cap:std(0x3b3b40,.7),slab:std(0xf7f7f5,.92),slabSide:std(0xdcdcda,.9),
  graphite:std(0x2c2c30,.5,.25),black:std(0x1c1c1e,.35,.6),chrome:std(0xd0d0d4,.18,.9),red:std(ACCENT,.45),
  white:std(0xf4f2ee,.55),fabric:std(0xcfcbc4,.95),fabricDark:std(0x8b8780,.95),ceramic:std(0xfbfbfb,.12),
  water:std(0xdde8ec,.05),asphalt:std(0x4a4b50,.95),leaf:std(0x5d7a52,.85,0,{flatShading:true}),leaf2:std(0x7a9467,.85,0,{flatShading:true}),
  trunk:std(0x6b5442,.9),carton:std(0xc6a27a,.85),column:std(0xb9b9bb,.7),
  glass:std(0xd6e6ee,.08,.1,{transparent:true,opacity:.18,depthWrite:false}),
  darkGlass:std(0x2a3138,.15,.4),mirror:std(0xcfd6da,.05,.95),
  lampGlow:std(0xfff3df,.6,0,{emissive:0xffe2b8,emissiveIntensity:.9}),
  oak:tileMat(TX.wood,1,1,.6),concreteMat:tileMat(TX.concrete,1,1,.8)
};
M.wallMats=[M.wall,M.wall,M.cap,M.wall,M.wall,M.wall];
function box(w,h,d,mat,x,y,z,parent,cast=true){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;(parent||scene).add(m);return m;}
function cyl(rt,rb,h,mat,x,y,z,parent,seg=20){const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;(parent||scene).add(m);return m;}
function R(x0,y0,x1,y1,h,mat,yb=0,parent,cast=true){return box(Math.abs(x1-x0)*S,h,Math.abs(y1-y0)*S,mat,wx((x0+x1)/2),yb+h/2,wz((y0+y1)/2),parent,cast);}
const IWH=2.5;
function IW(x0,y0,x1,y1,h=IWH){return R(x0,y0,x1,y1,h,M.wallMats,FL);}

/* ---------- base, street, plaza ---------- */
box((1540-360)*S,0.6,(1450-60)*S,M.slabSide,wx(950),-0.31,wz(755));
R(360,60,1540,1450,0.02,M.slab,-0.01,null,false);
const pave=c=>{const m=tileMat(TX.concrete,c[0],c[1],.85);m.color.setHex(0xe9e8e4);return m;};
R(360,1150,1540,1243,0.04,pave([22,2]),0,null,false);
R(1155,470,1540,1150,0.035,pave([7,12]),0,null,false);
R(360,1243,1540,1250,0.12,M.white,0);
R(360,1250,1540,1450,0.02,M.asphalt,0,null,false);
for(let x=380;x<1540;x+=180)R(x,1343,x+80,1347,0.025,M.white,0,null,false);
/* interior floors */
R(437,124,1137,1133,0.04,tileMat(TX.floor,(1137-437)*S/1.6,(1133-124)*S/1.6,.32),0,null,false);
R(1137,124,1465,452,0.04,tileMat(TX.floor,4,4,.32),0,null,false);
const zoneFloor=(x0,y0,x1,y1,tex,size,rough)=>R(x0,y0,x1,y1,0.05,tileMat(tex,(x1-x0)*S/size,(y1-y0)*S/size,rough),0,null,false);
zoneFloor(437,124,757,380,TX.concrete,1.2,.8);
zoneFloor(510,292,803,737,TX.wood,1.6,.6);
zoneFloor(1020,124,1260,230,TX.marble,1.2,.18);
zoneFloor(1020,230,1260,407,TX.wood,1.6,.55);
zoneFloor(928,410,1120,548,TX.warm,1.2,.2);
zoneFloor(928,599,1120,770,TX.concrete,1.2,.7);
zoneFloor(928,773,1120,915,TX.stone,1.2,.6);
zoneFloor(928,965,1120,1133,TX.stone,1.2,.6);
zoneFloor(1268,124,1465,452,TX.x2,0.6,.7);

/* ---------- exterior walls with windows (cut down when facing the camera) ---------- */
const HW=2.85, extWalls=[];
function extRun(dir,l0,l1,from,to,ops,n){
  const g=new THREE.Group();scene.add(g);const segs=[];let p=from;
  ops.slice().sort((a,b)=>a[0]-b[0]).forEach(o=>{if(o[0]>p)segs.push([p,o[0],'s']);segs.push(o);p=o[1];});if(p<to)segs.push([p,to,'s']);
  const rect=(a,b,h,mat,yb,ins=0)=>dir==='h'?R(a,l0+ins,b,l1-ins,h,mat,yb,g):R(l0+ins,a,l1-ins,b,h,mat,yb,g);
  const mid=(l1-l0)/2-0.6;
  segs.forEach(([a,b,t])=>{
    if(t==='s'){rect(a,b,HW,M.wallMats,0);return;}
    rect(a,b,HW-2.55,M.wallMats,2.55);
    if(t==='w'){rect(a,b,2.5,M.glass,0.05,mid);const n2=Math.max(1,Math.round((b-a)*S/1.3));
      for(let i=1;i<n2;i++){const m=a+(b-a)*i/n2;rect(m-1.2,m+1.2,2.5,M.graphite,0.05,mid-1.5);}
      rect(a,b,0.06,M.graphite,0.02,mid-1.5);}
    if(t==='d'){rect(a,a+2,2.55,M.graphite,0,mid-1.5);rect(b-2,b,2.55,M.graphite,0,mid-1.5);}
  });
  extWalls.push({g,n:n,cut:1});return g;
}
const topWin=[[477,547,'w'],[671,742,'w'],[847,920,'w'],[1020,1095,'w'],[1197,1270,'w'],[1372,1445,'w']];
extRun('h',107,124,420,1482,topWin,[0,-1]);
const bottomWall=extRun('h',1133,1150,420,1155,[[477,551,'w'],[661,714,'d'],[845,920,'w'],[1020,1095,'w']],[0,1]);
extRun('v',420,437,124,1133,[],[-1,0]);
extRun('v',1137,1155,452,1133,[],[1,0]);
extRun('v',1465,1482,124,470,[],[1,0]);
extRun('h',452,470,1155,1465,[],[0,1]);
// entrance sliding doors (part of the bottom wall so they cut with it)
const doorL=R(662,1141,688,1142.5,2.5,M.glass,0.05,bottomWall,false);
const doorR=R(688,1141,714,1142.5,2.5,M.glass,0.05,bottomWall,false);
const hdl=[R(684,1139,686,1144,0.9,M.black,0.7,bottomWall),R(690,1139,692,1144,0.9,M.black,0.7,bottomWall)];
const doorBase=[doorL.position.x,doorR.position.x,hdl[0].position.x,hdl[1].position.x];

/* ---------- interior partitions (from the plan) ---------- */
// service block: WC, storage, back corridor
IW(567,124,574,150);IW(567,200,574,240);IW(567,286,574,380);
IW(437,225,567,232);IW(437,374,574,380);
IW(652,124,657,250);IW(574,285,657,294);
IW(662,124,667,207);IW(757,124,762,207);IW(662,207,690,213);IW(735,207,762,213);
// ARCHITALON perimeter & managers block
IW(481,770,797,777);IW(437,802,521,807);IW(735,802,804,807);IW(481,777,487,807);IW(521,777,527,807);IW(735,777,741,802);
IW(439,717,505,722);IW(505,717,510,742);IW(510,736,547,742);
const arch=IW(770,425,803,635,2.6);
// vestibule
IW(640,1048,648,1133,2.3);IW(727,1048,735,1133,2.3);IW(635,1043,663,1048,2.3);IW(707,1043,735,1043+5,2.3);
// slider corridor
IW(920,187,1020,195);IW(920,400,1020,410);IW(1012,195,1020,400);
// booths
IW(920,520,928,966);IW(1120,405,1135,1133);
IW(1122,225,1268,235);IW(1157,267,1268,277);IW(1120,405,1268,415);
IW(1260,235,1268,336);IW(1260,405,1268,452);
IW(1020,548,1120,556);IW(1020,590,1120,599);IW(929,765,1020,775);IW(1020,913,1120,922);IW(1020,957,1120,966);
// structural columns
[[785,283],[785,440],[785,618],[785,793],[785,968],[1140,285]].forEach(([x,y])=>R(x-16,y-16,x+16,y+16,2.9,M.column,FL));

/* ---------- booth wall cladding ---------- */
function cladX(x,y0,y1,tex,dir){const t=tileMat(tex,(y1-y0)*S/1.2,2,.25);const m=R(x,y0,x+0.7*dir,y1,2.4,t,FL+0.02,null,false);return m;}
cladX(1119.5,415,548,TX.warm,-1);cladX(1119.5,599,765,TX.concrete,-1);cladX(1119.5,775,913,TX.stone,-1);cladX(1119.5,966,1133,TX.stone,-1);
cladX(1020.5,277,400,TX.wood,1);
R(1122,224.5,1260,225,2.4,tileMat(TX.marble,2,2,.18),FL+0.02,null,false);

/* ---------- furniture builders ---------- */
function vanity(x0,y0,x1,y1,side,top,basins=1,mirror=true){
  // side: wall direction 'n','s','e','w'
  const h=0.85,w=Math.abs(x1-x0)*S,d=Math.abs(y1-y0)*S;
  R(x0,y0,x1,y1,0.42,top||M.oak,FL+0.3);R(x0,y0,x1,y1,0.03,M.white,FL+0.72);
  const cx=(x0+x1)/2,cy=(y0+y1)/2;
  for(let i=0;i<basins;i++){
    const f=(i+0.5)/basins;const bx=side==='n'||side==='s'?x0+(x1-x0)*f:cx, by=side==='e'||side==='w'?y0+(y1-y0)*f:cy;
    const off={n:[0,-1],s:[0,1],e:[1,0],w:[-1,0]}[side],hd=(side==='n'||side==='s'?d:w)/2,br=Math.min(0.2,hd-0.03);
    cyl(br,br*0.75,0.13,M.ceramic,wx(bx),FL+0.82,wz(by),null,24);cyl(br*0.85,br*0.85,0.01,M.water,wx(bx),FL+0.885,wz(by),null,24);
    box(0.03,0.28,0.03,M.black,wx(bx)+off[0]*(hd-0.03),FL+0.89,wz(by)+off[1]*(hd-0.03));
    box(off[0]?0.14:0.03,0.03,off[1]?0.14:0.03,M.black,wx(bx)+off[0]*(hd-0.1),FL+1.02,wz(by)+off[1]*(hd-0.1));
    if(mirror){const mr=cyl(0.3,0.3,0.015,M.mirror,wx(bx)+off[0]*(Math.max(w,d)>0?0:0)+off[0]*0.32,FL+1.6,wz(by)+off[1]*0.32,null,36);
      mr.rotation.set(off[1]?Math.PI/2:0,0,off[0]?Math.PI/2:0);mr.position.set(wx(bx)+off[0]*(side==='e'||side==='w'?w/2+0.01:0),FL+1.6,wz(by)+off[1]*(side==='n'||side==='s'?d/2+0.01:0));}
  }
}
function cubeSink(x0,y0,x1,y1,side){
  R(x0,y0,x1,y1,0.82,M.ceramic,FL);const cx=wx((x0+x1)/2),cz=wz((y0+y1)/2);
  cyl(0.13,0.13,0.01,M.water,cx,FL+0.825,cz,null,20);
  const o={e:[1,0],w:[-1,0],n:[0,-1],s:[0,1]}[side];
  box(0.03,0.3,0.03,M.black,cx+o[0]*0.17,FL+0.97,cz+o[1]*0.17);box(o[0]?0.14:0.03,0.03,o[1]?0.14:0.03,M.black,cx+o[0]*0.11,FL+1.11,cz+o[1]*0.11);
}
function armchair(px,py,yaw,mat){const g=new THREE.Group();g.position.set(wx(px),FL,wz(py));g.rotation.y=yaw;scene.add(g);
  box(0.72,0.32,0.7,mat,0,0.24,0,g);box(0.72,0.5,0.14,mat,0,0.6,-0.28,g);box(0.12,0.42,0.7,mat,-0.36,0.38,0,g);box(0.12,0.42,0.7,mat,0.36,0.38,0,g);
  [[-0.3,-0.28],[0.3,-0.28],[-0.3,0.28],[0.3,0.28]].forEach(p=>box(0.04,0.08,0.04,M.black,p[0],0.04,p[1],g));return g;}
function chair(px,py,yaw,seat){const g=new THREE.Group();g.position.set(wx(px),FL,wz(py));g.rotation.y=yaw;scene.add(g);
  box(0.46,0.05,0.44,seat,0,0.46,0,g);box(0.46,0.42,0.04,seat,0,0.72,-0.21,g);
  [[-0.19,-0.18],[0.19,-0.18],[-0.19,0.18],[0.19,0.18]].forEach(p=>box(0.03,0.44,0.03,M.black,p[0],0.22,p[1],g));return g;}
function plant(px,py,s,tall){const g=new THREE.Group();g.position.set(wx(px),FL,wz(py));g.scale.setScalar(s);scene.add(g);
  cyl(0.24,0.18,0.5,M.white,0,0.25,0,g,16);
  if(tall){cyl(0.03,0.03,1.3,M.trunk,0,1.0,0,g,6);for(let i=0;i<7;i++){const l=new THREE.Mesh(new THREE.IcosahedronGeometry(0.22,0),i%2?M.leaf:M.leaf2);
    l.scale.set(1,0.35,1.4);const a=i*2.4;l.position.set(Math.cos(a)*0.2,0.9+i*0.14,Math.sin(a)*0.2);l.rotation.set(0.4,a,0.3);l.castShadow=true;g.add(l);}}
  else{for(let i=0;i<7;i++){const l=new THREE.Mesh(new THREE.ConeGeometry(0.07,0.8,4),i%2?M.leaf:M.leaf2);const a=i*0.9;
    l.position.set(Math.cos(a)*0.08,0.85,Math.sin(a)*0.08);l.rotation.set(Math.sin(a)*0.35,0,Math.cos(a)*0.35);l.castShadow=true;g.add(l);}}}
function shelves(x0,y0,x1,y1,dirZ){ // KIT MENSOLA floating shelves on a wall face
  [1.25,1.7].forEach((h,k)=>{R(x0,y0,x1,y1,0.03,M.oak,FL+h);
    for(let i=0;i<3;i++){const px=x0+(x1-x0)*(0.2+i*0.3);cyl(0.05,0.06,0.16+0.06*((i+k)%2),i%2?M.white:M.graphite,wx(px),FL+h+0.11,wz((y0+y1)/2),null,12);}});}
const sliderPanels=[];
function sliderRack(x0,y0,x1,y1,n,texs,pullDir){ // panels in planes parallel to x, stacked along y, slide along x
  R(x0,y0,x1,y1,0.06,M.graphite,FL+2.48);R(x0,y0,x1,y1,0.05,M.graphite,FL);
  const list=[];
  for(let i=0;i<n;i++){const py=y0+(y1-y0)*(i+0.5)/n;
    const g=new THREE.Group();g.position.set(wx((x0+x1)/2),FL+1.26,wz(py));scene.add(g);
    box((x1-x0)*S-0.06,2.36,0.018,tileMat(texs[i%texs.length],1,2,.3),0,0,0,g);
    box(0.03,0.3,0.05,M.red,pullDir*((x1-x0)*S/2-0.02),0,0,g);
    list.push({g,base:g.position.x,py});}
  sliderPanels.push(list);return list;
}

/* ---------- ARCHITALON zone ---------- */
// two "реверс" exposers 1200×2780 along the left wall
const expoPanels=[];
[[377,548],[548,720]].forEach(([y0,y1],u)=>{
  R(441,y0,447,y1,2.95,M.graphite,FL);R(447,y0,510,y0+3,0.06,M.graphite,FL+2.85);R(447,y1-3,510,y1,0.06,M.graphite,FL+2.85);
  const n=7;for(let i=0;i<n;i++){const py=y0+(y1-y0)*(i+0.5)/n;
    const piv=new THREE.Group();piv.position.set(wx(448),FL+1.42,wz(py));scene.add(piv);
    const m=box((510-448)*S,2.76,0.02,tileMat(i%3===1?TX.warm:TX.marbleBig,1,2,.15),(510-448)*S/2,0,0,piv);
    expoPanels.push(piv);}
});
// Reverse sliders 80×160
[[574,625],[626,677]].forEach(([x0,x1])=>{R(x0,300,x1,375,0.18,M.graphite,FL);for(let i=0;i<6;i++){const px=x0+(x1-x0)*(i+0.5)/6;
  R(px-0.6,302,px+0.6,373,1.6,tileMat([TX.stone,TX.wood,TX.concrete][i%3],1,2,.4),FL+0.18);}});
// meeting table 2000×900 with chairs
R(612,500,665,618,0.04,tileMat(TX.nero,1,1,.15),FL+0.73);
[[618,506],[659,506],[618,612],[659,612]].forEach(([x,y])=>R(x-1.5,y-1.5,x+1.5,y+1.5,0.73,M.black,FL));
chair(598,526,Math.PI/2,M.white);chair(598,581,Math.PI/2,M.white);chair(678,526,-Math.PI/2,M.white);chair(678,581,-Math.PI/2,M.white);
R(626,530,640,545,0.02,M.red,FL+0.77);R(645,560,655,585,0.03,M.white,FL+0.77);
// TV on the partition, facing west
R(767,480,770,562,0.78,M.black,FL+1.15);
function screenCanvas(drawFn){const c=document.createElement('canvas');c.width=420;c.height=240;drawFn(c.getContext('2d'),420,240);const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;}
const catTex=screenCanvas((g,W,H)=>{g.fillStyle='#f6f6f4';g.fillRect(0,0,W,H);g.fillStyle='#2c2c30';g.fillRect(0,0,W,34);
  g.fillStyle='#fff';g.font='600 16px Arial';g.fillText('ARCHITALON · коллекции',14,23);g.fillStyle='#FF4949';g.fillRect(W-44,13,28,8);
  [TX.marble,TX.stone,TX.wood,TX.concrete,TX.nero,TX.marbleBig,TX.warm,TX.stone].forEach((t,i)=>{const x=16+(i%4)*100,y=48+Math.floor(i/4)*94;
    g.drawImage(t.image,0,0,128,128,x,y,88,64);g.fillStyle='#8e8e93';g.fillRect(x,y+71,58,6);g.fillRect(x,y+81,36,5);});});
const projTex=screenCanvas((g,W,H)=>{g.fillStyle='#fbfbfa';g.fillRect(0,0,W,H);g.fillStyle='#1d1d1f';g.font='600 16px Arial';g.fillText('Проект ванной · 6,4 м²',16,25);
  g.fillStyle='#FF4949';g.fillRect(16,33,44,3);const ox=26,oy=50,w=220,h=160;g.drawImage(TX.marble.image,0,0,256,256,ox,oy,w,h);
  g.globalAlpha=.55;g.fillStyle='#fff';g.fillRect(ox,oy,w,h);g.globalAlpha=1;g.strokeStyle='#2c2c30';g.lineWidth=6;g.strokeRect(ox,oy,w,h);
  g.fillStyle='#fff';g.lineWidth=2;g.beginPath();g.ellipse(ox+140,oy+110,58,26,0,0,Math.PI*2);g.fill();g.stroke();
  g.strokeRect(ox+10,oy+10,62,62);g.beginPath();g.moveTo(ox+10,oy+10);g.lineTo(ox+72,oy+72);g.moveTo(ox+72,oy+10);g.lineTo(ox+10,oy+72);g.stroke();
  g.fillStyle='#b88a5c';g.fillRect(ox+110,oy+6,92,26);g.fillStyle='#fff';g.beginPath();g.arc(ox+156,oy+19,9,0,Math.PI*2);g.fill();
  [[TX.marbleBig,'Charme Deluxe'],[TX.nero,'Nero'],[TX.wood,'Wonderful Life']].forEach((s,i)=>{const y=54+i*56;g.drawImage(s[0].image,0,0,128,128,268,y,44,44);
    g.fillStyle='#1d1d1f';g.font='13px Arial';g.fillText(s[1],320,y+18);g.fillStyle='#8e8e93';g.fillText('120×278',320,y+36);});});
const tvA=new THREE.Mesh(new THREE.PlaneGeometry(1.3,0.74),new THREE.MeshBasicMaterial({map:catTex,toneMapped:false}));
tvA.position.set(wx(766.5),FL+1.54,wz(521));tvA.rotation.y=-Math.PI/2;scene.add(tvA);
const projMat=new THREE.MeshBasicMaterial({map:projTex,toneMapped:false,transparent:true,opacity:0});
const tvB=new THREE.Mesh(new THREE.PlaneGeometry(1.3,0.74),projMat);tvB.position.set(wx(766.3),FL+1.54,wz(521));tvB.rotation.y=-Math.PI/2;scene.add(tvB);
const archSign=new THREE.Mesh(new THREE.PlaneGeometry(1.6,0.4),new THREE.MeshBasicMaterial({map:wordTex('ARCHITALON','#1d1d1f'),transparent:true,toneMapped:false}));
archSign.position.set(wx(769.6),FL+2.25,wz(560));archSign.rotation.y=-Math.PI/2;scene.add(archSign);
R(768,600,770,620,1.8,M.graphite,FL+0.2); // LIBRERIA SMALL
// ceramoteca drawers ×3 + tozzetaria shelf
[[548,611],[612,673],[674,736]].forEach(([x0,x1])=>{R(x0,742,x1,768,0.95,M.white,FL);
  for(let k=0;k<5;k++)R(x0+2,741,x1-2,742,0.16,std(0xe7e5e0,.5),FL+0.05+k*0.18);R(x0,742,x1,768,0.02,tileMat(TX.stone,1,1,.4),FL+0.95);});
R(737,742,797,768,0.06,M.oak,FL+0.02);[0.5,1.0,1.5].forEach(h=>R(737,742,797,768,0.03,M.oak,FL+h));R(737,742,740,768,1.6,M.oak,FL);R(794,742,797,768,1.6,M.oak,FL);
for(let i=0;i<6;i++)R(742+i*9,748,748+i*9,765,0.22,tileMat([TX.nero,TX.marble,TX.wood][i%3],1,1,.3),FL+0.53);
// managers' shelving facing reception
R(527,778,735,802,2.0,M.white,FL);
for(let k=0;k<4;k++){const xs=527+k*52;R(xs+1,802,xs+51,803,1.9,std(0xeeedea,.7),FL+0.05,null,false);
  [0.55,1.05,1.55].forEach((h,j)=>{for(let b=0;b<5;b++){const bx=xs+6+b*9;R(bx,795,bx+7,803.5,0.32,b%3===((k+j)%3)?M.red:(b%2?M.graphite:std(0xd9d6cf,.8)),FL+h);}});}
const recSign=new THREE.Mesh(new THREE.PlaneGeometry(2.2,0.55),new THREE.MeshBasicMaterial({map:logoTex('#1d1d1f'),transparent:true,toneMapped:false}));
recSign.position.set(wx(632),FL+2.27,wz(803.5));scene.add(recSign);R(567,802.6,698,803.4,0.03,M.red,FL+2.0,null,false);
// reception: two tables 2000×800 with chairs, monitors
R(509,861,746,908,0.05,M.white,FL+0.73);R(509,862,746,907,0.68,std(0xe6e4df,.6),FL+0.05);R(509,906,746,908,0.12,M.red,FL+0.3,null,false);
[[567,866],[697,866]].forEach(([x,y])=>{const g=new THREE.Group();g.position.set(wx(x),FL+0.78,wz(y));scene.add(g);g.rotation.y=Math.PI;
  box(0.16,0.012,0.12,M.black,0,0.006,0,g);box(0.03,0.22,0.03,M.black,0,0.12,0.03,g);box(0.56,0.33,0.025,M.graphite,0,0.36,0.03,g);
  const sc=new THREE.Mesh(new THREE.PlaneGeometry(0.52,0.3),new THREE.MeshBasicMaterial({map:catTex,toneMapped:false}));sc.position.set(0,0.36,0.045);g.add(sc);});
const deskFolder=R(630,880,645,892,0.03,M.red,FL+0.78);
chair(567,840,0,M.red);chair(697,840,0,M.red);
// lounge: oval table, armchairs, catalog library
const ov=cyl(0.5,0.5,0.04,tileMat(TX.nero,1,1,.15),wx(495),FL+0.42,wz(1034),null,32);ov.scale.set(1.0,1,0.55);ov.rotation.y=0.55;
cyl(0.06,0.14,0.4,M.black,wx(495),FL+0.2,wz(1034),null,12);
armchair(466,1067,Math.atan2(wx(495)-wx(466),wz(1034)-wz(1067)),M.fabric);armchair(522,1098,Math.atan2(wx(495)-wx(522),wz(1034)-wz(1098)),M.fabric);
R(607,1052,630,1122,1.85,M.oak,FL);[0.4,0.8,1.2,1.6].forEach((h,j)=>{for(let b=0;b<6;b++){const by=1056+b*11;R(608,by,612,by+9,0.3,b%3===j%3?M.red:M.white,FL+h);}});
plant(455,1110,1.0,true);plant(870,1105,0.9,false);plant(455,830,0.8,false);

/* ---------- slider corridor 120×240 ×20 panels ×3 ---------- */
const sliderTex=[TX.marbleBig,TX.stone,TX.wood,TX.concrete,TX.nero,TX.warm];
const bigSliders=[];[[195,263],[263,332],[332,400]].forEach(([y0,y1],u)=>bigSliders.push(sliderRack(922,y0+2,1010,y1-2,9,sliderTex.slice(u).concat(sliderTex.slice(0,u)),-1)));

/* ---------- collection booths ---------- */
// Charme Deluxe 8.4 m²
vanity(1105,127,1192,143,'n',M.oak,2,false);
armchair(1198,205,Math.PI*0.85,M.fabricDark);cyl(0.32,0.32,0.03,M.white,wx(1222),FL+0.42,wz(176),null,24);cyl(0.04,0.04,0.4,M.black,wx(1222),FL+0.2,wz(176),null,8);
plant(1246,212,0.8,false);
sliderRack(1125,236,1212,266,6,[TX.marble,TX.marbleBig,TX.warm],-1);
// Wonderful Life 8.8 m²
vanity(1024,300,1041,387,'w',M.graphite,1,true);
cubeSink(1197,278,1227,305,'n');cyl(0.17,0.2,0.42,M.fabricDark,wx(1242),FL+0.21,wz(306),null,20);
shelves(1150,400,1215,404,1);
// Charme Advance 8.9 m²
vanity(930,411,1016,425,'n',M.oak,2,true);
cubeSink(1096,447,1120,470,'e');cubeSink(1096,496,1120,519,'e');shelves(1030,540,1110,547);
// Metropolis 9.1 m²
vanity(931,645,950,730,'w',M.graphite,1,true);
(function(){const x0=1098,x1=1118,y0=622,y1=710;R(x0,y0,x1,y1,0.03,M.black,FL);R(x0,y0,x1,y1,0.03,M.black,FL+2.0);
  R(x0,y0,x1,y0+1.5,2.0,M.black,FL);R(x0,y1-1.5,x1,y1,2.0,M.black,FL);
  for(let i=0;i<4;i++){const s=box(0.3,0.025,(y1-y0)*S*0.62,M.oak,wx((x0+x1)/2),FL+0.35+i*0.45,wz((y0+y1)/2));s.rotation.x=(i%2?1:-1)*0.5;}
  [[640,0.65],[690,1.1],[655,1.55]].forEach(([y,h])=>cyl(0.05,0.07,0.2,M.white,wx(1108),FL+h,wz(y),null,10));})();
shelves(1030,600,1110,606);
// Continuum 9 m²
vanity(931,790,950,880,'w',M.oak,1,true);
R(1090,820,1120,890,0.82,M.concreteMat,FL);R(1094,826,1116,884,0.02,M.water,FL+0.8,null,false);
box(0.03,0.32,0.03,M.black,wx(1118),FL+0.98,wz(855));box(0.15,0.03,0.03,M.black,wx(1112),FL+1.13,wz(855));
shelves(1030,906,1110,912);sliderRack(1022,925,1118,955,6,[TX.stone,TX.concrete],-1);
sliderRack(1022,558,1118,588,6,[TX.warm,TX.concrete],-1);
// Continuum 9.2 m²
R(1097,1013,1119,1095,0.04,M.oak,FL+0.74);R(1097,1015,1100,1093,0.74,M.black,FL);
const lt=cyl(0.42,0.42,0.04,tileMat(TX.stone,1,1,.3),wx(970),FL+0.4,wz(1112),null,32);lt.scale.set(1,1,0.6);cyl(0.05,0.1,0.38,M.black,wx(970),FL+0.19,wz(1112),null,10);
plant(940,1095,0.85,true);armchair(1000,1060,-Math.PI*0.7,M.fabric);

/* ---------- X2 zone ---------- */
vanity(1423,165,1460,240,'e',M.graphite,1,false);vanity(1423,248,1460,325,'e',M.graphite,2,false);
R(1423,332,1460,405,1.9,M.oak,FL);[0.5,1.0,1.5].forEach(h=>R(1422,335,1423,402,0.02,M.graphite,FL+h,null,false));
R(1315,258,1381,300,0.06,M.white,FL+0.9);R(1325,266,1371,292,0.88,M.red,FL+0.02);
const x2Logo=new THREE.Mesh(new THREE.PlaneGeometry(2.4,0.9),new THREE.MeshBasicMaterial({map:wordTex('X2','#FF4949',512,192,700),transparent:true,toneMapped:false}));
x2Logo.position.set(wx(1464.5),FL+2.0,wz(386));x2Logo.rotation.y=-Math.PI/2;scene.add(x2Logo);
plant(1290,430,0.9,true);
// back of house fixtures
R(440,240,462,370,2.0,M.oak,FL);[0.5,1.0,1.5].forEach(h=>{for(let b=0;b<4;b++){const by=246+b*30;R(442,by,462,by+24,0.34,M.carton,FL+h-0.42);}});
cyl(0.2,0.2,0.42,M.ceramic,wx(470),FL+0.21,wz(150),null,16);R(520,128,560,145,0.12,M.ceramic,FL+0.8);

/* ---------- entrance stele & street ---------- */
R(519,1156,601,1174,2.4,M.white,0.02);R(519,1155,601,1175,0.06,M.red,0.5);
const stele=logoTex('#1d1d1f');
[1174.2,1155.8].forEach((y,i)=>{const p=new THREE.Mesh(new THREE.PlaneGeometry(1.3,0.33),new THREE.MeshBasicMaterial({map:stele,transparent:true,toneMapped:false}));
  p.position.set(wx(560),2.0,wz(y));if(i)p.rotation.y=Math.PI;scene.add(p);});
function tree(px,py,s=1){const x=wx(px),z=wz(py);cyl(0.07,0.1,1.6*s,M.trunk,x,0.8*s,z,null,6);
  const c=new THREE.Mesh(new THREE.IcosahedronGeometry(0.85*s,0),M.leaf);c.position.set(x,2.15*s,z);c.castShadow=true;scene.add(c);
  const c2=new THREE.Mesh(new THREE.IcosahedronGeometry(0.55*s,0),M.leaf2);c2.position.set(x+0.35,2.6*s,z-0.2);c2.castShadow=true;scene.add(c2);
  box(0.9,0.03,0.9,M.graphite,x,0.045,z,null,false);}
tree(880,1215);tree(1230,1215);tree(1400,1215,0.9);tree(1300,700);tree(1460,940);tree(1250,1040,0.9);
R(1320,860,1420,885,0.06,M.oak,0.42);R(1325,862,1330,883,0.42,M.black,0);R(1410,862,1415,883,0.42,M.black,0);
for(let y=520;y<1140;y+=95)cyl(0.03,0.03,0.6,M.graphite,wx(1170),0.3,wz(y),null,6);

/* ---------- delivery van ---------- */
const van=new THREE.Group();scene.add(van);van.position.set(wx(200),0.02,wz(1295));
const vanWhite=std(0xfafafa,.35,.1);
box(2.6,1.55,1.5,vanWhite,-0.45,1.12,0,van);box(0.85,1.15,1.46,vanWhite,1.27,0.92,0,van);box(0.86,0.2,1.47,vanWhite,1.27,0.42,0,van);
box(0.02,0.55,1.3,M.darkGlass,1.705,1.15,0,van);box(0.6,0.5,0.02,M.darkGlass,1.3,1.18,0.735,van);box(0.6,0.5,0.02,M.darkGlass,1.3,1.18,-0.735,van);
box(3.46,0.1,0.02,M.red,0,0.62,0.755,van);box(3.46,0.1,0.02,M.red,0,0.62,-0.755,van);
box(0.06,0.12,0.3,M.lampGlow,1.71,0.6,0.5,van);box(0.06,0.12,0.3,M.lampGlow,1.71,0.6,-0.5,van);
const vLogo=new THREE.MeshBasicMaterial({map:logoTex('#1d1d1f'),transparent:true,toneMapped:false});
const vl1=new THREE.Mesh(new THREE.PlaneGeometry(1.9,0.475),vLogo);vl1.position.set(-0.45,1.35,0.752);van.add(vl1);
const vl2=vl1.clone();vl2.position.z=-0.752;vl2.rotation.y=Math.PI;van.add(vl2);
const vanDoor=box(0.95,1.3,0.03,vanWhite,-0.15,1.05,-0.77,van);
const wheels=[];[[-1.1,0.72],[1.2,0.72],[-1.1,-0.72],[1.2,-0.72]].forEach(p=>{const w=new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.32,0.22,18),M.black);
  w.rotation.x=Math.PI/2;w.position.set(p[0],0.32,p[1]);w.castShadow=true;van.add(w);w.add(new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,0.23,10),M.chrome));wheels.push(w);});
van.visible=false;
function orderBox(parent){const g=new THREE.Group();box(0.42,0.3,0.34,M.carton,0,0,0,g);box(0.43,0.02,0.08,M.red,0,0.15,0,g,false);(parent||scene).add(g);return g;}
const flyBox=orderBox();flyBox.visible=false;

/* ---------- zone labels ---------- */
const labels=[];
function label(text,px,py,h=2.95){const W=512,H=112;const t=textTex((g)=>{g.font='600 40px Inter,"Segoe UI",Arial,sans-serif';const w=g.measureText(text).width+56;
  const x=(W-w)/2;g.fillStyle='rgba(255,255,255,.9)';g.beginPath();if(g.roundRect)g.roundRect(x,18,w,76,38);else g.rect(x,18,w,76);g.fill();
  g.fillStyle='#FF4949';g.beginPath();g.arc(x+28,56,7,0,Math.PI*2);g.fill();g.fillStyle='#1d1d1f';g.textBaseline='middle';g.fillText(text,x+44,58);},W,H);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthTest:false,toneMapped:false}));s.scale.set(2.2,0.48,1);
  s.position.set(wx(px),h,wz(py));s.renderOrder=10;scene.add(s);labels.push(s);}
label('Charme Deluxe',1140,175);label('Wonderful Life',1140,345);label('Charme Advance',1025,480);label('Metropolis',1025,685);
label('Continuum',1025,845);label('Continuum',1025,1045);label('ARCHITALON',650,440);label('Зона X2',1350,330);
label('Ресепшн',627,930,2.4);label('Слайдеры 120×240',880,300);label('Склад',500,300,2.6);

/* ---------- people ---------- */
function person(o){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);body.scale.setScalar(0.92);scene.add(root);
  const mat=c=>std(c,.8,0,{flatShading:true});const mS=mat(o.shirt),mP=mat(o.pants),mK=mat(o.skin),mH=mat(o.hair),mShoe=mat(0x202022);
  const hip=new THREE.Group();hip.position.y=0.9;body.add(hip);
  const leg=x=>{const p=new THREE.Group();p.position.x=x;hip.add(p);box(0.17,0.82,0.19,mP,0,-0.41,0,p);box(0.18,0.08,0.28,mShoe,0,-0.85,0.04,p);return p;};
  const lL=leg(-0.11),lR=leg(0.11);
  box(0.46,0.62,0.26,mS,0,1.21,0,body);box(0.36,0.1,0.22,mS,0,1.55,0,body);
  if(o.badge)box(0.08,0.05,0.02,M.red,0.13,1.38,0.135,body,false);
  const headG=new THREE.Group();headG.position.y=1.6;body.add(headG);box(0.09,0.08,0.09,mK,0,0,0,headG);
  const head=new THREE.Mesh(new THREE.IcosahedronGeometry(0.16,1),mK);head.position.y=0.17;headG.add(head);
  const hair=new THREE.Mesh(new THREE.SphereGeometry(0.168,10,6,0,Math.PI*2,0,Math.PI*0.52),mH);hair.position.set(0,0.19,-0.012);headG.add(hair);
  if(o.cap){box(0.3,0.06,0.3,M.red,0,0.31,0.02,headG);box(0.22,0.02,0.12,M.red,0,0.29,0.19,headG);}
  if(o.bun){const b=new THREE.Mesh(new THREE.SphereGeometry(0.08,8,6),mH);b.position.set(0,0.32,-0.1);headG.add(b);}
  const arm=x=>{const p=new THREE.Group();p.position.set(x,1.47,0);body.add(p);box(0.12,0.56,0.13,mS,0,-0.28,0,p);box(0.1,0.1,0.1,mK,0,-0.61,0,p);return p;};
  const aL=arm(-0.3),aR=arm(0.3);root.traverse(m=>{if(m.isMesh)m.castShadow=true;});
  return{root,body,lL,lR,aL,aR,headG,yaw:null,props:{},j:{lL:0,lR:0,aL:0,aR:0,aLz:0,aRz:0,y:0,head:0}};
}
const P={
  A:person({shirt:0x2f3a56,pants:0xc8b79a,skin:0xe0b08f,hair:0x3a2a20}),
  C:person({shirt:0x2c2c30,pants:0x2c2c30,skin:0xd9a07c,hair:0x1c1c1c,badge:true}),
  D:person({shirt:0xf1efe9,pants:0x3a3d44,skin:0xeac2a3,hair:0x8a5a3a,bun:true,badge:true}),
  E:person({shirt:0x2c2c30,pants:0x55565c,skin:0xc68e6a,hair:0x222222,badge:true,cap:true}),
  B:person({shirt:0xc9a34a,pants:0x2d2f36,skin:0xf0c9a8,hair:0xb58a54}),
  G:person({shirt:0xf1efe9,pants:0x2c2c30,skin:0xd7a582,hair:0x2a1a12,badge:true}),
  F:person({shirt:0x8fa58c,pants:0xd9d4c8,skin:0x8d5a3e,hair:0x1a1a1a,bun:true})
};
P.A.props.folder=box(0.04,0.3,0.22,M.red,0,-0.66,0.06,P.A.aL);
P.C.props.folder=box(0.04,0.3,0.22,M.red,0,-0.66,0.06,P.C.aR);
P.D.props.sample=box(0.22,0.012,0.22,tileMat(TX.marbleBig,1,1,.2),0,-0.66,0.1,P.D.aR);P.D.props.sample.rotation.x=-1.0;
P.F.props.book=box(0.3,0.03,0.22,M.red,0,1.02,0.42,P.F.body);
P.E.props.box=orderBox(P.E.body);P.E.props.box.position.set(0,1.08,0.42);
for(const id in P)for(const k in P[id].props)P[id].props[k].visible=false;

/* ---------- timeline ---------- */
const {tracks,tags}=compileScript(SCRIPT,LOOP_T,WALK);
const T=LOOP_T;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),sm=t=>t*t*(3-2*t),ramp=(t,a,b)=>sm(clamp((t-a)/(b-a),0,1)),inR=(t,a,b)=>t>=a&&t<b;
function trackAt(keys,t){let i=0;while(i<keys.length-2&&t>=keys[i+1].t)i++;const a=keys[i],b=keys[i+1];
  if(a.x===b.x&&a.y===b.y)return{x:a.x,y:a.y,walk:false,act:a.act||'stand',look:a.look,pose:a.pose,hold:a.hold};
  const u=clamp((t-a.t)/(b.t-a.t),0,1);return{x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,walk:true,act:'walk',dx:b.x-a.x,dy:b.y-a.y,hold:a.hold};}
const angDiff=(a,b)=>{let d=b-a;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return d;};
function poseArms(tg,s,g,id,t){
  switch(s.pose){
    case 'wave':tg.aR=-2.5+Math.sin(g*9)*0.2;tg.aRz=0.25+Math.sin(g*9)*0.15;break;
    case 'talk':tg.aL=-0.45+Math.sin(g*2.3)*0.2;tg.aR=-0.55+Math.sin(g*2.9+1)*0.22;break;
    case 'point':tg.aR=-1.45;tg.aRz=0.15;break;
    case 'show':tg.aR=-1.2+Math.sin(g*1.6)*0.12;tg.aL=-0.35;tg.head=Math.sin(g*0.7)*0.5;break;
    case 'look':tg.head=Math.sin(g*0.8)*0.5;break;
    case 'touch':tg.aR=-0.95+Math.sin(g*1.8)*0.15;tg.head=Math.sin(g*0.6)*0.25;break;
    case 'type':tg.aL=tg.aR=-1.1+Math.sin(g*16)*0.05;break;
    case 'pull':tg.aR=-1.35;tg.aL=-0.25;tg.head=0.3;break;
    case 'take':tg.aL=tg.aR=-1.25;break;
    case 'give':tg.aR=-1.3;tg.aL=-0.2;break;
    case 'read':tg.aL=tg.aR=-0.95;tg.head=Math.sin(g*0.35)*0.4;break;
    case 'present':{const m=tags.A.sit;if(inR(t,m.s+2,m.s+5)||inR(t,m.e-4,m.e-2)){tg.aR=-1.45;tg.aRz=-0.1;tg.head=0;}else{tg.aL=-0.6+Math.sin(g*2.2)*0.2;tg.aR=-0.7+Math.sin(g*2.7)*0.2;tg.head=Math.sin(g*0.5)*0.6-0.3;}break;}
  }
  if(s.hold==='box'&&s.pose!=='give'){tg.aL=tg.aR=-1.25;}
  if(s.hold==='folder'&&id==='A'&&s.pose!=='wave')tg.aL=-0.45;
  if(s.hold==='sample'&&s.pose!=='show')tg.aR=-0.9;
}
function drive(id,t,g,dt){
  const p=P[id],s=trackAt(tracks[id],t);
  p.root.position.set(wx(s.x),FL,wz(s.y));
  let ty=p.yaw==null?0:p.yaw;
  if(s.walk)ty=Math.atan2(s.dx,s.dy);else if(s.look)ty=Math.atan2(s.look[0]-s.x,s.look[1]-s.y);
  if(p.yaw==null)p.yaw=ty;p.yaw+=angDiff(p.yaw,ty)*Math.min(1,dt*7);p.root.rotation.y=p.yaw;
  const tg={lL:0,lR:0,aL:0,aR:0,aLz:0,aRz:0,y:0,head:0};
  if(s.walk){const ph=g*8.5,sn=Math.sin(ph);tg.lL=sn*.6;tg.lR=-sn*.6;tg.aL=-sn*.45;tg.aR=sn*.45;tg.y=Math.abs(Math.cos(ph))*.035;}
  else if(s.act==='sit'){tg.lL=tg.lR=-1.45;tg.y=-0.37;tg.aL=tg.aR=-0.55;}
  else{tg.aL=tg.aR=0.04*Math.sin(g*1.3);}
  poseArms(tg,s,g,id,t);
  const k=Math.min(1,dt*12),j=p.j;for(const n in tg)j[n]+=(tg[n]-j[n])*k;
  p.lL.rotation.x=j.lL;p.lR.rotation.x=j.lR;p.aL.rotation.x=j.aL;p.aR.rotation.x=j.aR;p.aL.rotation.z=-j.aLz;p.aR.rotation.z=j.aRz;
  p.body.position.y=j.y;p.headG.rotation.y=j.head;
  for(const k2 in p.props)p.props[k2].visible=s.hold===k2;
  return s;
}

const ev=[
  [tags.A.enter.s,'Покупатель заходит через стеклянные двери'],
  [tags.E.pull1.s,'Сотрудник выдвигает слайдер с керамогранитом 120×240'],
  [tags.C.greet.s,'Консультант встречает клиента у входа'],
  [tags.D.show.s,'Дизайнер показывает плитку на экспозиторе ARCHITALON'],
  [tags.B.fly.s,'Посетитель рассматривает раковину и смеситель в зоне Continuum'],
  [tags.E.pick.s,'Сотрудник собирает заказ на складе'],
  [tags.A.sit.s,'Клиент садится обсудить проект'],
  [tags.A.sit.s+2,'На экране появляется проект ванной комнаты'],
  [tags.B.cube.s,'Посетитель выбирает раковину в зоне Charme Advance'],
  [tags.E.give.s-5.5,'Фирменный автомобиль ITALON X2 приехал за заказом'],
  [tags.E.give.e+0.4,'Автомобиль уезжает с заказом'],
  [tags.B.deluxe.s,'Посетитель осматривает Charme Deluxe'],
  [tags.G.x2.s,'Консультант показывает зону X2'],
  [tags.C.handover.s,'Консультант передаёт оформленный заказ'],
  [tags.A.leave.s,'Клиент уходит с готовым проектом'],
  [tags.E.pull2.s,'Сотрудник выдвигает следующий слайдер']
].sort((a,b)=>a[0]-b[0]);

/* ---------- lights ---------- */
scene.add(new THREE.HemisphereLight(0xffffff,0xd9d0c3,0.72));
const sun=new THREE.DirectionalLight(0xfff0dc,1.5);sun.position.set(11,20,13);sun.target.position.set(0,0,1.5);scene.add(sun);scene.add(sun.target);
sun.castShadow=true;sun.shadow.mapSize.set(coarse?1024:2048,coarse?1024:2048);
Object.assign(sun.shadow.camera,{left:-17,right:17,top:17,bottom:-17,near:1,far:60});sun.shadow.bias=-0.0004;sun.shadow.normalBias=0.025;
const fill=new THREE.DirectionalLight(0xe8eef5,0.35);fill.position.set(-10,8,-6);scene.add(fill);

/* ---------- camera ---------- */
const camera=new THREE.OrthographicCamera(-10,10,10,-10,0.1,300);
const target=new THREE.Vector3(0,0.8,1.6);const elev=THREE.MathUtils.degToRad(46),dist=70;
camera.position.set(target.x+Math.cos(elev)*dist*Math.sin(0.7),target.y+Math.sin(elev)*dist,target.z+Math.cos(elev)*dist*Math.cos(0.7));camera.lookAt(target);
const controls=new OrbitControls(camera,canvas);controls.target.copy(target);controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=0.07;
controls.minPolarAngle=THREE.MathUtils.degToRad(30);controls.maxPolarAngle=THREE.MathUtils.degToRad(56);controls.minZoom=0.8;controls.maxZoom=4;controls.zoomSpeed=0.8;
let interacting=false,lastInput=-1e9;
controls.addEventListener('start',()=>{interacting=true;});controls.addEventListener('end',()=>{interacting=false;lastInput=performance.now();});
canvas.addEventListener('wheel',()=>{lastInput=performance.now();},{passive:true});
function fit(){const box=canvas.parentElement,w=Math.max(1,box.clientWidth),h=Math.max(1,box.clientHeight),a=w/h;renderer.setSize(w,h,false);
  const Rr=a<1?12.4:14.6;let halfH=Math.max(Rr*Math.sin(elev)+2.2,Rr/a);if(a<1)halfH*=0.9;
  camera.left=-halfH*a;camera.right=halfH*a;camera.top=halfH;camera.bottom=-halfH;camera.updateProjectionMatrix();}
const ro=new ResizeObserver(fit);ro.observe(canvas.parentElement);fit();

/* ---------- HUD ---------- */
const fmt=n=>Math.round(n).toLocaleString('ru-RU').replace(/\s/g,' ');
const evtEl=$('evt'),bar=$('bar'),clockEl=$('clock');
let curEvt=0;function setEvent(i){if(i===curEvt)return;curEvt=i;evtEl.classList.add('fade');setTimeout(()=>{evtEl.textContent=ev[i][1];evtEl.classList.remove('fade');},300);}
const reduce0=window.matchMedia('(prefers-reduced-motion: reduce)').matches;let playing=!reduce0;const playBtn=$('play');if(reduce0)playBtn.textContent='Продолжить';
playBtn.addEventListener('click',()=>{playing=!playing;playBtn.textContent=playing?'Пауза':'Продолжить';});
const lblBtn=$('labels');
lblBtn.addEventListener('click',()=>{const on=lblBtn.getAttribute('aria-pressed')!=='true';lblBtn.setAttribute('aria-pressed',on);labels.forEach(l=>l.visible=on);});

/* ---------- loop ---------- */
const clock=new THREE.Clock();let sim=0,g=0;
const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const orbitSpeed=(Math.PI*2)/(reduce?160:90);
const tmpV=new THREE.Vector3(),yAxis=new THREE.Vector3(0,1,0);
let vanPrevX=van.position.x,doorOpen=0;
const gv=tags.E.give;
function slideAmt(t,tg){return 1.25*(ramp(t,tg.s+0.5,tg.s+1.8)-ramp(t,tg.e-1.5,tg.e-0.2));}
const pull1Panel=bigSliders[0][Math.round(bigSliders[0].length*0.6)],pull2Panel=bigSliders[1][Math.round(bigSliders[1].length*0.7)];
const showPanel=expoPanels[5];showPanel.userData.bx=showPanel.position.x;

let raf=0,visible=true;
function frame(){
  const rdt=Math.min(clock.getDelta(),0.05),dt=playing?rdt:0;sim+=dt;g+=dt;const t=sim%T;
  if(playing&&!interacting&&performance.now()-lastInput>3000){tmpV.copy(camera.position).sub(controls.target).applyAxisAngle(yAxis,orbitSpeed*rdt);camera.position.copy(controls.target).add(tmpV);}
  controls.update();
  // cut exterior walls that stand between the camera and the interior
  const cx=camera.position.x-target.x,cz=camera.position.z-target.z,cl=Math.hypot(cx,cz)||1;
  extWalls.forEach(w=>{const f=(w.n[0]*cx+w.n[1]*cz)/cl;const tgt=f>0.25?0.16:1;w.cut+=(tgt-w.cut)*Math.min(1,rdt*4);w.g.scale.y=w.cut;});
  x2Logo.visible=extWalls[4].cut>0.8;

  for(const id in P)drive(id,t,g,dt||1e-4);
  const aS=Math.min(ramp(t,0,0.45),1-ramp(t,tags.A.leave.e,tags.A.leave.e+0.45));P.A.root.scale.setScalar(Math.max(0.001,aS));P.A.root.visible=aS>0.01;
  deskFolder.visible=!(P.C.props.folder.visible||P.A.props.folder.visible||inR(t,tags.A.atDesk.s-3.2,tags.A.leave.e+0.5));
  P.E.props.box.visible=P.E.props.box.visible&&!(inR(t,gv.s+0.3,gv.e));

  pull1Panel.g.position.x=pull1Panel.base-slideAmt(t,tags.E.pull1);
  pull2Panel.g.position.x=pull2Panel.base-slideAmt(t,tags.E.pull2);
  showPanel.position.x=showPanel.userData.bx+0.45*(ramp(t,tags.D.show.s+0.6,tags.D.show.s+1.6)-ramp(t,tags.D.show.e-1.2,tags.D.show.e-0.2));
  projMat.opacity=ramp(t,tags.A.sit.s+2,tags.A.sit.s+3.2)*(1-ramp(t,tags.A.sit.e+3,tags.A.sit.e+4));

  // entrance doors
  let open=0;for(const id in P){const p=P[id].root;if(p.visible&&Math.hypot(p.position.x-wx(687),p.position.z-wz(1141))<1.9)open=1;}
  doorOpen+=(open-doorOpen)*Math.min(1,(dt||0)*5);const o=0.42*doorOpen;
  doorL.position.x=doorBase[0]-o;doorR.position.x=doorBase[1]+o;hdl[0].position.x=doorBase[2]-o;hdl[1].position.x=doorBase[3]+o;

  // van
  const stopX=wx(705),startX=wx(330),endX=wx(1580),v0=gv.s-5.5;let vx=startX,vs=0;
  if(inR(t,v0,gv.e+6.2)){vx=startX+(stopX-startX)*(1-Math.pow(1-clamp((t-v0)/5,0,1),2.2));
    if(t>gv.e+0.6)vx=stopX+(endX-stopX)*Math.pow(clamp((t-gv.e-0.6)/5,0,1),2.2);
    vs=Math.min(ramp(t,v0,v0+0.4),1-ramp(t,gv.e+5.6,gv.e+6.0));}
  van.visible=vs>0.01;van.scale.setScalar(Math.max(0.001,vs));van.position.x=vx;
  const dx=vx-vanPrevX;vanPrevX=vx;if(Math.abs(dx)<1)wheels.forEach(w=>w.rotation.y-=dx/0.32);
  vanDoor.position.x=-0.15-0.95*(ramp(t,gv.s-0.8,gv.s-0.2)-ramp(t,gv.e+0.1,gv.e+0.5));
  if(inR(t,gv.s+0.3,gv.s+1.1)){const u=sm((t-gv.s-0.3)/0.8);flyBox.visible=true;
    const sx=wx(705),sy=FL+1.0,sz=wz(1226)+0.38,ex=vx-0.15,ey=1.05,ez=wz(1295);
    flyBox.position.set(sx+(ex-sx)*u,sy+(ey-sy)*u+Math.sin(u*Math.PI)*0.3,sz+(ez-sz)*u);flyBox.scale.setScalar(1-0.3*u);}else flyBox.visible=false;

  let ei=0;for(let i=0;i<ev.length;i++)if(t>=ev[i][0])ei=i;setEvent(ei);
  bar.style.width=(t/T*100).toFixed(2)+'%';
  const mins=Math.floor((t/T)*600);clockEl.textContent='Сейчас в салоне · '+String(10+Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');
  renderer.render(scene,camera);raf=visible?requestAnimationFrame(frame):0;
}
evtEl.textContent=ev[0][1];
const io=new IntersectionObserver(es=>{visible=es[0].isIntersecting&&!document.hidden;if(visible&&!raf){clock.getDelta();raf=requestAnimationFrame(frame);}},{threshold:0.05});io.observe(canvas.parentElement);
document.addEventListener('visibilitychange',()=>{if(document.hidden)visible=false;else if(!raf){visible=true;clock.getDelta();raf=requestAnimationFrame(frame);}});
frame();
return{dispose(){visible=false;io.disconnect();ro.disconnect();controls.dispose();renderer.dispose();}};
}
