"""Pack render_scene.py EXR output into small web layers for src/pool-lab.mjs.

Run with the same Python that has `bpy` (it reads EXR) and Pillow:
  python encode_layers.py RENDER_DIR public/media/pool-lab data/pool-lab-scene.json
Lighting layers become gamma-2.2 WebP scaled by a stored factor; the tile map becomes two lossless
PNGs holding millimetre coordinates as 16-bit hi/lo bytes plus the zone id.
"""
import json, os, sys
import numpy as np, bpy
from PIL import Image

src, dst, manifest_path = sys.argv[1:4]
os.makedirs(dst, exist_ok=True)
scene = json.load(open(os.path.join(src, 'scene.json')))
WHITE = scene['white']


def load(name):
    im = bpy.data.images.load(os.path.join(src, name)); w, h = im.size
    a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, :3]
    bpy.data.images.remove(im)
    return a


def save_hdr(a, name):
    a = np.maximum(a, 0)
    scale = float(max(np.percentile(a.max(axis=2), 99.8), 1e-4))
    enc = (np.clip(a / scale, 0, 1) ** (1 / 2.2) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(enc).save(os.path.join(dst, name), 'WEBP', quality=90, method=6)
    return scale


manifest = {'resolution': scene['resolution'], 'variants': {}}
for variant, geometry in scene['variants'].items():
    uv = load(f'{variant}-uv.exr')
    zone = np.rint(uv[..., 2]).clip(0, 3).astype(np.uint8)
    layers = {}
    for axis, name in [(0, 'u'), (1, 'v')]:
        mm = np.where(zone > 0, np.rint(uv[..., axis] * 1000), 0).clip(0, 65535).astype(np.uint16)
        assert mm[zone > 0].min() > 0, 'tile coordinates must stay positive'
        rgb = np.stack([(mm >> 8).astype(np.uint8), (mm & 255).astype(np.uint8), zone * 80], axis=2)
        Image.fromarray(rgb).save(os.path.join(dst, f'{variant}-{name}.png'), optimize=True)
    for group in ['sun', 'pool', 'house']:
        black = load(f'{variant}-black-{group}.exr')
        light = (load(f'{variant}-white-{group}.exr') - black) / WHITE
        light[zone == 0] = 0
        layers[group] = {'base': save_hdr(black, f'{variant}-{group}-base.webp'),
                         'light': save_hdr(light, f'{variant}-{group}-light.webp')}
    manifest['variants'][variant] = {**geometry, 'layers': layers}
    print(variant, layers, flush=True)
json.dump(manifest, open(manifest_path, 'w'), indent=2)
