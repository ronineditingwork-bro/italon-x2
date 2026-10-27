#!/usr/bin/env node
// Offline, dependency-free importer for the reviewed X2 Outdoor Lab scene pack.
// It changes ONLY the four whitelisted WebP files; never writes HTML/CSS/JS.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const expected = {
  'public/media/outdoor/red-brick.webp': '2108f936ddd372dac086f2c7cb6425657a3f36a868469fc7a6899d39e7e63b4e',
  'public/media/outdoor/red-brick-thumb.webp': 'c21d8a0ad4b94720049124c5e764c15dc2c7d0ced90ae9f96b12d32cc24fafaf',
  'public/media/outdoor/white-country.webp': '5736290f08ac8d82d745fbc865e1adc7a41ceeb7dc973ff1a630e882d6a4f66f',
  'public/media/outdoor/white-country-thumb.webp': 'c75931cbbacd9b7c2dabc6d5c0be0e596d15c45b4b814a6d4c528ec600fd59bc',
};
const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const file = process.argv.slice(2).find(a => !a.startsWith('--'));
if (!file) {
  console.error('Usage: node scripts/outdoor/import-scene-pack.mjs /path/to/outdoor-scene-pack.zip [--dry-run]');
  process.exit(2);
}
const zip = await readFile(resolve(file));
if (zip.length > 10_000_000) throw Error('Archive exceeds size limit');
const u16 = off => zip.readUInt16LE(off);
const u32 = off => zip.readUInt32LE(off);
let eocd = -1;
for (let p = zip.length - 22; p >= Math.max(0, zip.length - 65557); p--) {
  if (u32(p) === 0x06054b50) { eocd = p; break; }
}
if (eocd < 0) throw Error('Invalid ZIP: central directory not found');
const entries = u16(eocd + 10), start = u32(eocd + 16);
if (entries > 30 || start > zip.length) throw Error('Invalid ZIP table');
const ready = new Map();
let at = start;
for (let i = 0; i < entries; i++) {
  if (at + 46 > zip.length || u32(at) !== 0x02014b50) throw Error('Corrupted ZIP central directory');
  const method = u16(at + 10), compressed = u32(at + 20), original = u32(at + 24);
  const nameLen = u16(at + 28), extra = u16(at + 30), comment = u16(at + 32);
  const offset = u32(at + 42), name = zip.subarray(at + 46, at + 46 + nameLen).toString('utf8');
  at += 46 + nameLen + extra + comment;
  if (!Object.hasOwn(expected, name)) continue;
  if (original > 6_000_000 || compressed > 6_000_000) throw Error(name + ': too big');
  if (offset + 30 > zip.length || u32(offset) !== 0x04034b50) throw Error(name + ': bad local header');
  const dataAt = offset + 30 + u16(offset + 26) + u16(offset + 28);
  if (dataAt + compressed > zip.length) throw Error(name + ': truncated content');
  const bytes = zip.subarray(dataAt, dataAt + compressed);
  const decoded = method === 8 ? inflateRawSync(bytes, { maxOutputLength: 6_000_000 }) :
                  method === 0 ? bytes : null;
  if (!decoded || decoded.length !== original) throw Error(name + ': unsupported ZIP encoding or size');
  const digest = createHash('sha256').update(decoded).digest('hex');
  if (digest !== expected[name]) throw Error(name + ': checksum mismatch');
  if (decoded.toString('ascii', 0, 4) !== 'RIFF' || decoded.toString('ascii', 8, 12) !== 'WEBP')
    throw Error(name + ': invalid WebP header');
  if (ready.has(name)) throw Error(name + ': duplicate image');
  ready.set(name, decoded);
}
for (const name of Object.keys(expected)) if (!ready.has(name)) throw Error('Missing asset ' + name);
if (process.argv.includes('--dry-run')) {
  console.log('Validated all four scene images; no files changed.');
} else {
  for (const [name, bytes] of ready) {
    const dest = join(root, name);
    await mkdir(resolve(dest, '..'), { recursive: true });
    await writeFile(dest, bytes);
    console.log('Installed ' + name + ' (' + bytes.length + ' bytes)');
  }
}
