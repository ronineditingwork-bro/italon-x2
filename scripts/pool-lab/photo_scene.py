"""Turn a finished pool photo/render into Pool Lab layers (same format as encode_layers.py).

The scene JSON gives, per tiled plane, a polygon mask and a perspective fit of the photo's own
joint grid:  v = a*(x-x0)/(y-hx)  (across, metres)  and  u = c/(y-hu) - u0  (depth, metres).
The tile layer is the photo with the original joints closed, divided by the original tile albedo,
so any catalog tile is relit by the photo's own sun, shadows and water.

Usage: python photo_scene.py scripts/pool-lab/scenes/gory.json IMAGE public/media/pool-lab data/pool-lab-scene.json
"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

spec_path, image_path, dst, manifest_path = sys.argv[1:5]
spec = json.load(open(spec_path))
name, W = spec['id'], spec['width']
photo = Image.open(image_path).convert('RGB')
photo = photo.resize((W, round(photo.height * W / photo.width)), Image.LANCZOS)
H = photo.height
lin = (np.asarray(photo, np.float32) / 255) ** 2.2
UV0 = 24.0  # keeps coordinates positive; a multiple of every tile side so joints stay on the photo grid


def mask(polys, minus=()):
    m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m)
    for p in polys: d.polygon([tuple(pt) for pt in p], fill=255)
    for p in minus: d.polygon([tuple(pt) for pt in p], fill=0)
    return np.asarray(m) > 127


ys, xs = np.mgrid[0:H, 0:W].astype(np.float64)
zone = np.zeros((H, W), np.uint8); u = np.zeros((H, W)); v = np.zeros((H, W))
for plane in spec['planes']:
    m = mask(plane['polygons'], spec.get('exclude', []) + plane.get('exclude', []))
    f = plane['fit']
    m &= (ys > f['hu'] + 5) & (ys > f['hx'] + 5)
    zone[m] = plane['zone']
    u[m] = f['c'] / (ys[m] - f['hu']) - f['u0'] + UV0
    v[m] = f['a'] * (xs[m] - f['x0']) / (ys[m] - f['hx']) + UV0

# close thin dark joints so the new grout is the only one drawn, then soften tile texture noise
k = spec.get('jointPx', 5)
closed = photo.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k)).filter(ImageFilter.GaussianBlur(1.2))
clin = (np.asarray(closed, np.float32) / 255) ** 2.2
albedo0 = np.array(spec['albedo0'], np.float32)
keep = np.array([spec.get('keepUnderwater', 0.1) if z == 2 else 0.0 for z in range(4)], np.float32)[zone][..., None]
tiled = (zone > 0)[..., None]
base = np.where(tiled, clin * keep, lin)
light = np.where(tiled, clin * (1 - keep) / albedo0, 0)


def save_hdr(a, file):
    scale = float(max(np.percentile(a.max(axis=2), 99.8), 1e-4))
    Image.fromarray((np.clip(a / scale, 0, 1) ** (1 / 2.2) * 255 + 0.5).astype(np.uint8)).save(f'{dst}/{file}', 'WEBP', quality=92, method=6)
    return scale


for axis, arr in [('u', u), ('v', v)]:
    mm = np.where(zone > 0, np.rint(arr * 1000), 0).clip(0, 65535).astype(np.uint16)
    assert mm[zone > 0].min() > 0, f'{axis}: tile coordinates must stay positive'
    Image.fromarray(np.stack([(mm >> 8).astype(np.uint8), (mm & 255).astype(np.uint8), zone * 80], 2)).save(f'{dst}/{name}-{axis}.png', optimize=True)
layers = {'sun': {'base': save_hdr(base, f'{name}-sun-base.webp'), 'light': save_hdr(light, f'{name}-sun-light.webp')}}
photo.resize((480, round(480 * H / W)), Image.LANCZOS).save(f'{dst}/{name}-thumb.webp', 'WEBP', quality=80)

manifest = json.load(open(manifest_path))
manifest.setdefault('variants', {})[name] = {
    'label': spec['label'], 'kind': 'photo', 'resolution': [W, H], 'pool': spec['pool'], 'hotspots': spec['hotspots'],
    'zones': sorted({int(z) for z in np.unique(zone) if z}), 'layers': layers}
json.dump(manifest, open(manifest_path, 'w'), indent=2, ensure_ascii=False)
print(name, W, H, {z: int((zone == z).sum()) for z in range(4)}, layers)
