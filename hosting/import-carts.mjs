import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openDatabase } from './database.mjs';
import { calculateCart } from './api.mjs';

const input = process.argv[2];
if (!input) throw new Error('Usage: node server/import-carts.mjs FILE.json (or - for stdin)');
const parts = [];
let length = 0;
if (input === '-') {
  for await (const part of process.stdin) {
    length += part.length;
    if (length > 20000000) throw new Error('Cart export is too large');
    parts.push(part);
  }
} else parts.push(await readFile(input));
const exported = JSON.parse(Buffer.concat(parts).toString('utf8'));
if (!Array.isArray(exported.rows) || exported.rows.length > 10000) throw new Error('Invalid cart export');
const seen = new Set();
for (const row of exported.rows) {
  if (!/^[a-f0-9]{64}$/.test(row.id) || seen.has(row.id) || !Number.isSafeInteger(row.version) || row.version < 0 ||
      !Number.isSafeInteger(row.updated_at) || typeof row.items !== 'string') throw new Error('Invalid cart export row');
  seen.add(row.id);
  calculateCart(JSON.parse(row.items));
}
const { database, close } = openDatabase(resolve(process.env.DB_PATH || resolve(import.meta.dirname, '../data/cart.sqlite')));
try {
  database.exec('BEGIN IMMEDIATE');
  const insert = database.prepare('INSERT INTO carts (id, items, version, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET items = excluded.items, version = excluded.version, updated_at = excluded.updated_at WHERE excluded.updated_at > carts.updated_at');
  let changes = 0;
  for (const row of exported.rows) changes += Number(insert.run(row.id, row.items, row.version, row.updated_at).changes);
  database.exec('COMMIT');
  console.log(JSON.stringify({ imported: changes, rows: exported.rows.length, capturedAt: exported.capturedAt || null }));
} catch (error) { database.exec('ROLLBACK'); throw error; }
finally { close(); }
