import test from 'node:test';
import assert from 'node:assert/strict';
import { poolData } from '../site/pages/pool.mjs';
import { ZONES, zonesOf, optionsFor, parseHash, toHash, areasOf, estimate, defaults } from '../site/shared/pool/model.mjs';
import { calculateArea } from '../src/catalog.mjs';

const { scenes, options } = poolData('./');

test('pool lab: Italon 60×120 in the bowl, X2 60×120 on deck and coping, one option per colour', () => {
  assert.ok(options.italon.length >= 10 && options.italon.every(o => o.format === '60X120' && !/X2/.test(o.collection)));
  assert.ok(options.x2.length >= 8 && options.x2.every(o => o.format === '60X120'));
  assert.equal(new Set(options.x2.map(o => o.name)).size, options.x2.length);
  assert.equal(optionsFor(options, 'coping'), options.x2);
  assert.ok(options.italon.some(o => o.texture?.src.includes('media/lab/')), 'scans of the same colour are used where they exist');
});
test('pool lab: every scene has deck and bowl layers and hotspots', () => {
  for (const s of Object.values(scenes)) { assert.ok(s.zones.includes(1) && s.zones.includes(2)); assert.ok(s.layers.sun); }
  assert.ok(Object.values(scenes).some(s => s.layers.pool), 'at least one scene has an evening shot');
});
test('pool lab: share link keeps known values and drops the rest', () => {
  const ids = Object.keys(scenes), bowl = options.italon.at(-1).code;
  const s = parseHash(`#scene=${ids.at(-1)}&light=dusk&bowl=${bowl}&deck=600010001804&length=12.5&width=999&zone=nope`, scenes, options);
  assert.equal(s.scene, ids.at(-1)); assert.equal(s.light, 'dusk'); assert.equal(s.bowl, bowl);
  assert.equal(s.deck, defaults(scenes, options).deck); assert.equal(s.length, 12.5); assert.equal(s.width, scenes[ids.at(-1)].pool.width); assert.equal(s.zone, 'deck');
  assert.deepEqual(parseHash('#' + toHash(s), scenes, options), s);
});
test('pool lab: areas and packs match the site pricing; a SKU on two zones is rounded once', () => {
  const withCoping = Object.keys(scenes).find(k => scenes[k].zones.includes(3)), noCoping = Object.keys(scenes).find(k => !scenes[k].zones.includes(3));
  const s = { ...defaults(scenes, options), length: 8, width: 4, depth: 1.5, deckArea: 60 };
  assert.deepEqual(areasOf(s, scenes[withCoping]), { deck: 60, bowl: 68, coping: 7.56 });
  assert.equal(areasOf(s, scenes[noCoping]).coping, 0);
  const r = estimate({ ...s, scene: withCoping, coping: s.deck }, scenes[withCoping], options), deck = r.lines.find(l => l.option.code === s.deck);
  assert.deepEqual(deck.zones, ['Терраса', 'Бортик']); assert.equal(Math.round(deck.area * 100) / 100, 67.56);
  for (const l of r.lines) assert.equal(l.packs, calculateArea(l.option.code, Math.round(l.area * 100) / 100, 10).packs);
  assert.deepEqual(zonesOf(scenes[noCoping]).map(z => z.id), ZONES.filter(z => z.id !== 'coping').map(z => z.id));
});
