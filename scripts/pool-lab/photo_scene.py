"""Turn a finished pool photo/render into Pool Lab layers (same format as encode_layers.py).

The scene JSON gives, per tiled plane, a polygon mask and a perspective fit of the photo's own
joint grid:  v = a*(x-x0)/(y-hx)  (across, metres)  and  u = c/(y-hu) - u0  (depth, metres).
The tile layer is the photo with the original joints closed, divided by the original tile albedo,
so any catalog tile is relit by the photo's own sun, shadows and water.

Usage: python photo_scene.py scripts/pool-lab/scenes/gory.json IMAGE public/media/pool-lab data/pool-lab-scene.json [EVENING_IMAGE]
An evening image must be the same shot (same camera); it reuses the day masks and fits.
"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from fit_grid import dlt

spec_path, image_path, dst, manifest_path = sys.argv[1:5]
evening_path = sys.argv[5] if len(sys.argv) > 5 else None
spec = json.load(open(spec_path))
name, W = spec['id'], spec['width']
photo = Image.open(image_path).convert('RGB')
photo = photo.resize((W, round(photo.height * W / photo.width)), Image.LANCZOS)
H = photo.height
UV0 = 24.0  # keeps coordinates positive; a multiple of every tile side so joints stay on the photo grid


def mask(polys, minus=()):
    m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m)
    for p in polys: d.polygon([tuple(pt) for pt in p], fill=255)
    for p in minus: d.polygon([tuple(pt) for pt in p], fill=0)
    return np.asarray(m) > 127


ys, xs = np.mgrid[0:H, 0:W].astype(np.float64)
zone = np.zeros((H, W), np.uint8); u = np.zeros((H, W)); v = np.zeros((H, W))
def plane_uv(f, ys, xs):
    if 'quad' in f:  # four image corners of a known rectangle: (0,0) (Lu,0) (Lu,Lv) (0,Lv), u = long side
        lu, lv = f['size']; f = {'H': dlt(np.array(f['quad'], float), np.array([[0, 0], [lu, 0], [lu, lv], [0, lv]], float))}
    if 'H' in f:  # homography from fit_grid.py: pixels -> (u long side, v short side) metres
        Hm = np.array(f['H']); q = Hm @ np.vstack([xs, ys, np.ones_like(xs)])
        return q[0] / q[2], q[1] / q[2]
    return f['c'] / (ys - f['hu']) - f['u0'], f['a'] * (xs - f['x0']) / (ys - f['hx']) - f.get('v0', 0)


TILE = (1.2, 0.6)  # tile the fits index in; joints sit on multiples of it
for plane in spec['planes']:
    m = mask(plane['polygons'], spec.get('exclude', []) + plane.get('exclude', []))
    if 'maxSaturation' in plane:  # tiles are grey: leaves, flowers and terracotta are not
        rgb = np.asarray(photo, np.float32); hi = rgb.max(2)
        m &= (hi - rgb.min(2)) / np.maximum(hi, 1) <= plane['maxSaturation']
    fits = plane.get('fits') or [{'core': None, **plane['fit']}]
    for f in fits:
        if 'hu' in f: m &= (ys > f['hu'] + 5) & (ys > f['hx'] + 5)
    py, px = ys[m], xs[m]
    if len(fits) == 1:
        pu, pv = plane_uv(fits[0], py, px)
    else:
        # AI-drawn photos bend perspective across the frame: blend local fits with soft weights,
        # after shifting each fit by whole tiles so the overlapping joints agree
        weights, coords = [], []
        for f in fits:
            core = Image.fromarray((mask([f['core']]) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(plane.get('blendPx', 60)))
            weights.append(np.asarray(core, np.float64)[m] / 255 + 1e-6); coords.append(np.array(plane_uv(f, py, px)))
        for k in range(1, len(fits)):
            both = (weights[0] > 0.15) & (weights[k] > 0.15)
            assert both.sum() > 50, f'fit {k} does not overlap the first fit; widen its core polygon'
            for axis, step in enumerate(TILE):
                coords[k][axis] -= step * np.round(np.median(coords[k][axis][both] - coords[0][axis][both]) / step)
        wsum = sum(weights); pu, pv = sum(w * c for w, c in zip(weights, coords)) / wsum
    zone[m] = plane['zone']; u[m] = pu + UV0; v[m] = pv + UV0

albedo0 = np.array(spec['albedo0'], np.float32)
keep = np.array([spec.get('keepUnderwater', 0.1) if z == 2 else 0.0 for z in range(4)], np.float32)[zone][..., None]
tiled = (zone > 0)[..., None]


def split(img):
    """Untiled base and per-albedo light of one photo."""
    # remove the photo's own thin joints (dark: closing, light: opening) so only the new grout is drawn
    k = spec.get('jointPx', 5)
    order = {'light': 'o', 'both': 'co'}.get(spec.get('joints'), 'c')   # c: closing removes dark lines, o: opening removes light ones
    clean = img
    for op in order: clean = clean.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k)) if op == 'c' else clean.filter(ImageFilter.MinFilter(k)).filter(ImageFilter.MaxFilter(k))
    clin = (np.asarray(clean.filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255) ** 2.2
    return np.where(tiled, clin * keep, (np.asarray(img, np.float32) / 255) ** 2.2), np.where(tiled, clin * (1 - keep) / albedo0, 0)


def save_hdr(a, file):
    scale = float(max(np.percentile(a.max(axis=2), 99.8), 1e-4))
    Image.fromarray((np.clip(a / scale, 0, 1) ** (1 / 2.2) * 255 + 0.5).astype(np.uint8)).save(f'{dst}/{file}', 'WEBP', quality=92, method=6)
    return scale


for axis, arr in [('u', u), ('v', v)]:
    mm = np.where(zone > 0, np.rint(arr * 1000), 0).clip(0, 65535).astype(np.uint16)
    assert mm[zone > 0].min() > 0, f'{axis}: tile coordinates must stay positive'
    Image.fromarray(np.stack([(mm >> 8).astype(np.uint8), (mm & 255).astype(np.uint8), zone * 80], 2)).save(f'{dst}/{name}-{axis}.png', optimize=True)
layers = {}
# photo scenes put the evening shot in the renderer's 'pool' light slot; the page shows it as «Вечер»
for group, path in [('sun', image_path), ('pool', evening_path)]:
    if not path: continue
    img = Image.open(path).convert('RGB').resize((W, H), Image.LANCZOS)
    base, light = split(img)
    layers[group] = {'base': save_hdr(base, f'{name}-{group}-base.webp'), 'light': save_hdr(light, f'{name}-{group}-light.webp')}
photo.resize((480, round(480 * H / W)), Image.LANCZOS).save(f'{dst}/{name}-thumb.webp', 'WEBP', quality=80)

manifest = json.load(open(manifest_path))
variants = manifest.setdefault('variants', {})
if spec.get('eveningOf'): variants[spec['eveningOf']]['eveningScene'] = name   # evening shot from another camera: its own maps, shown by «Вечер»
variants[name] = {**({'eveningOf': spec['eveningOf']} if spec.get('eveningOf') else {}),
    'label': spec['label'], 'kind': 'photo', 'resolution': [W, H], 'pool': spec['pool'], 'hotspots': spec['hotspots'],
    'zones': sorted({int(z) for z in np.unique(zone) if z}), 'layers': layers}
json.dump(manifest, open(manifest_path, 'w'), indent=2, ensure_ascii=False)
print(name, W, H, {z: int((zone == z).sum()) for z in range(4)}, layers)
