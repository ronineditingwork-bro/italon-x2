// Verify that every published Outdoor Lab scene has the local image and thumbnail.
// Run after unpacking a new scene asset pack and before deployment.
// Fail closed: broken images must never silently reach the live site.
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SCENES } from '../../site/shared/outdoor/scenes.mjs';

const base = resolve(import.meta.dirname, '../../public');
let errors = [];
for (const scene of SCENES) {
  if (!Number.isInteger(scene.width) || !Number.isInteger(scene.height) || scene.width < 300 || scene.height < 200) {
    errors.push(scene.id + ': invalid dimensions');
  }
  if (!Array.isArray(scene.zones) || !scene.zones.length || scene.zones.length > 4) {
    errors.push(scene.id + ': invalid number of zones');
  }
  for (const zone of scene.zones || []) {
    if (!Array.isArray(zone.rings?.[0]) || zone.rings[0].length < 3) errors.push(scene.id + '/' + zone.id + ': invalid polygon');
    for (const [x,y] of zone.rings?.[0] || []) {
      if (![x,y].every(Number.isFinite) || x < 0 || y < 0 || x > scene.width || y > scene.height)
        errors.push(scene.id + '/' + zone.id + ': point outside image');
    }
  }
  for (const path of [scene.image, scene.thumb]) {
    if (!/^media\/outdoor\/[a-z0-9-]+\.webp$/.test(path)) { errors.push(scene.id + ': unexpected image path ' + path); continue; }
    const full = resolve(base, path);
    if (!full.startsWith(base + '/')) { errors.push(scene.id + ': invalid path'); continue; }
    try {
      const [st, b] = await Promise.all([stat(full), readFile(full)]);
      if (st.size < 1024 || st.size > 6_000_000) errors.push(path + ': invalid file size');
      if (b.toString('ascii',0,4) !== 'RIFF' || b.toString('ascii',8,12) !== 'WEBP') errors.push(path + ': not a WebP image');
    } catch { errors.push(path + ': missing. Install the scene asset pack before merging/deploying.'); }
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('OK: images, thumbnails and polygons for ' + SCENES.length + ' scenes');
