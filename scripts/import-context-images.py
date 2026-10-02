"""Import matched collection scenes and catalog installation photographs.

Originals stay in the local download cache. Production serves optimized local WebP
assets, with collection matching and source/catalog pages retained as provenance.
"""
import argparse, hashlib, io, json
from pathlib import Path
from PIL import Image, ImageOps
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser()
parser.add_argument('--collection-candidates')
parser.add_argument('--laying-sources', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
cache = root / '.sites-runtime/image-downloads'
cache.mkdir(parents=True, exist_ok=True)
price = json.loads((root / 'data/italon-price-2026-07.json').read_text())
known = {s['slug'] for s in price['series']}
existing = json.loads((root / 'data/image-provenance.json').read_text())['collections']
swatches = {'prima', 'status', 'velvet', 'x2-aura', 'x2-magma', 'x2-fossil', 'x2-district'}
sources = {key: value for key, value in existing.items() if key not in swatches}
if args.collection_candidates:
    for entry in json.loads(Path(args.collection_candidates).read_text()):
        if entry['id'] not in known:
            raise ValueError('Unknown collection: ' + entry['id'])
        sources[entry['id']] = entry
laying = json.loads(Path(args.laying_sources).read_text())
manifest = {'collections': {}, 'laying': {}}
provenance = {'retrievedOn': '2026-10-02', 'collections': {}, 'laying': {},
              'layingCatalog': laying['catalog_title'], 'layingReuseNotes': laying['reuse_notes']}

def original(source):
    local = source.get('localPath') or source.get('local_path')
    if local and Path(local).is_file():
        return Path(local).read_bytes()
    url = source.get('imageUrl') or source.get('original_image_url')
    stored = cache / hashlib.sha256(url.encode()).hexdigest()
    if stored.is_file():
        return stored.read_bytes()
    with urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30) as response:
        if not response.headers.get('Content-Type', '').startswith('image/'):
            raise ValueError('Source did not return an image: ' + url)
        raw = response.read(16 * 1024 * 1024 + 1)
    if len(raw) > 16 * 1024 * 1024:
        raise ValueError('Source image exceeds limit')
    stored.write_bytes(raw)
    return raw

def encode(raw, budget):
    with Image.open(io.BytesIO(raw)) as loaded:
        image = ImageOps.exif_transpose(loaded).convert('RGB')
        image.thumbnail((800, 800), Image.Resampling.LANCZOS)
        for quality in (66, 60, 54, 48):
            output = io.BytesIO()
            image.save(output, format='WEBP', quality=quality, method=6)
            if len(output.getvalue()) <= budget:
                return image, output.getvalue()
        image.thumbnail((680, 680), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        image.save(output, format='WEBP', quality=54, method=6)
        return image, output.getvalue()

collection_captions = {
    'bottega': 'На стенах — мозаика Боттега Лава. На полу — Вельвет Голд.',
    'surface-wall-project': 'На стенах — Серфейс Мун Уайт 50 × 120. На полу — Статус Мока.',
}
for key, source in sources.items():
    raw = original(source)
    image, encoded = encode(raw, 34000)
    filename = key + '-' + hashlib.sha256(encoded).hexdigest()[:12] + '.webp'
    dest = root / 'public/media/collections' / filename
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(encoded)
    asset = '/media/collections/' + filename
    manifest['collections'][key] = {'src': asset, 'width': image.width, 'height': image.height}
    if key in collection_captions:
        manifest['collections'][key]['caption'] = collection_captions[key]
    provenance['collections'][key] = {
        'sourceUrl': source.get('sourceUrl'), 'imageUrl': source.get('imageUrl'),
        'evidence': source.get('evidence'), 'asset': asset,
        'mediaType': source.get('mediaType', 'Collection scene from user repository'),
        'reuseNotes': source.get('reuseNotes'), 'pdfPage': source.get('pdfPage'),
        'originalSha256': hashlib.sha256(raw).hexdigest(),
    }

captions = {
    'grass': 'Плиты в газоне с открытыми травяными швами.',
    'gravel': 'Монтаж плиты на подготовленное гравийное основание.',
    'pedestals': 'Установка плиты на регулируемую опору с зазором под покрытием.',
    'adhesive': 'Нанесение плиточного клея зубчатым шпателем перед укладкой плиты.',
}
labels = {'grass': 'На траву', 'gravel': 'На гравий', 'pedestals': 'На опоры', 'adhesive': 'На клей'}
for source in laying['assets']:
    key = source['method']
    raw = original(source)
    image, encoded = encode(raw, 45000)
    dest = root / 'public/media/laying' / (key + '.webp')
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(encoded)
    asset = '/media/laying/' + key + '.webp'
    manifest['laying'][key] = {'label': labels[key], 'caption': captions[key], 'alt': captions[key],
                             'image': {'src': asset, 'width': image.width, 'height': image.height}}
    provenance['laying'][key] = {
        'sourceUrl': source['source_page_url'], 'imageUrl': source['original_image_url'],
        'evidence': source['visible_evidence'], 'pdfPage': source['pdf_page_1_indexed'],
        'printedPage': source['printed_catalog_page'], 'asset': asset,
        'originalSha256': hashlib.sha256(raw).hexdigest(),
    }

(root / 'data/context-images.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
(root / 'data/context-image-provenance.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n')
used = {Path(image['src']).name for image in manifest['collections'].values()}
for file in (root / 'public/media/collections').glob('*.webp'):
    if file.name not in used:
        file.unlink()
print(json.dumps({'collections': len(manifest['collections']), 'laying': len(manifest['laying']),
                  'missing': sorted(known - set(manifest['collections'])),
                  'bytes': sum(p.stat().st_size for folder in ('collections', 'laying')
                               for p in (root / 'public/media' / folder).glob('*.webp'))}))
