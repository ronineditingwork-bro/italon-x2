"""Import verified SKU images and clearly labeled collection fallbacks.

Requires Pillow and requests. Source maps are collected outside the Site checkout; build and
production serving never depend on third-party requests. Source URLs and matching
evidence are retained in data/image-provenance.json.
"""
import argparse, concurrent.futures, hashlib, io, json, threading
from pathlib import Path
from PIL import Image, ImageOps
import requests

parser=argparse.ArgumentParser()
parser.add_argument('--sku-map', required=True)
parser.add_argument('--collection-map')
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
source=json.loads(Path(args.sku_map).read_text())['products']
price=json.loads((root/'data/italon-price-2026-07.json').read_text())
targets={p['code'] for s in price['series'] for p in s['items']}
slugs={s['slug'] for s in price['series']}
cache=root/'.sites-runtime/image-downloads';cache.mkdir(parents=True,exist_ok=True)
dest=root/'public/media/products';dest.mkdir(parents=True,exist_ok=True)
jobs=[('products',code,p['imageUrl'],p) for code,p in source.items() if code in targets and code!='450080000001']
connections=threading.local()
if args.collection_map:
 for p in json.loads(Path(args.collection_map).read_text()):
  slug=Path(p['name']).stem
  if slug in slugs:jobs.append(('collections',slug,p['url'],{'sourceUrl':p['source'],'imageUrl':p['url'],'evidence':'User repository filename matches source collection slug'}))

def fetch(job):
 group,key,url,provenance=job
 try:
  identifier=hashlib.sha256(url.encode()).hexdigest()
  original=cache/identifier
  if original.exists():raw=original.read_bytes()
  else:
   if not hasattr(connections,'session'):connections.session=requests.Session()
   with connections.session.get(url,timeout=25,stream=True) as response:
    response.raise_for_status()
    if not response.headers.get('Content-Type','').startswith('image/'):raise ValueError('Response is not an image')
    raw=b''
    for chunk in response.iter_content(65536):
     raw+=chunk
     if len(raw)>8*1024*1024:raise ValueError('Oversized image')
   if len(raw)>8*1024*1024:raise ValueError('Oversized image')
   temporary=original.with_suffix('.tmp');temporary.write_bytes(raw);temporary.replace(original)
  with Image.open(io.BytesIO(raw)) as loaded:
   image=ImageOps.exif_transpose(loaded).convert('RGB')
   if min(image.size)<30:raise ValueError('Image too small')
   image.thumbnail((480,480),Image.Resampling.LANCZOS)
   encoded=io.BytesIO();image.save(encoded,format='WEBP',quality=72,method=6)
   data=encoded.getvalue();digest=hashlib.sha256(data).hexdigest()[:20]
   filename=digest+'.webp';(dest/filename).write_bytes(data)
   metadata={'src':'/media/products/'+filename,'kind':'sku' if group=='products' else 'collection','width':image.width,'height':image.height}
   return group,key,metadata,{**provenance,'originalSha256':hashlib.sha256(raw).hexdigest(),'asset':metadata['src']},None
 except Exception as e:return group,key,None,None,str(e)

manifest={'products':{},'collections':{}}
provenance={'retrievedOn':'2026-10-02','products':{},'collections':{},'failures':[]}
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
 for count,(group,key,metadata,evidence,error) in enumerate(pool.map(fetch,jobs),1):
  if error:provenance['failures'].append({'group':group,'key':key,'error':error})
  else:manifest[group][key]=metadata;provenance[group][key]=evidence
  if count%100==0:print(json.dumps({'done':count,'jobs':len(jobs),'errors':len(provenance['failures'])}),flush=True)
(root/'data/product-images.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(root/'data/image-provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
used={p['src'].rsplit('/',1)[1] for group in manifest.values() for p in group.values()}
for file in dest.glob('*.webp'):
 if file.name not in used:file.unlink()
print(json.dumps({'skuImages':len(manifest['products']),'collectionImages':len(manifest['collections']),'uniqueFiles':len(used),'totalBytes':sum((dest/f).stat().st_size for f in used),'errors':provenance['failures']}),flush=True)
