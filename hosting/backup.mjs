import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const source = resolve(process.env.DB_PATH || resolve(import.meta.dirname, '../data/cart.sqlite'));
const output = resolve(process.argv[2] || resolve(dirname(source), 'backups', `cart-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`));
if (source === output) throw new Error('Backup must have a separate path');
await mkdir(dirname(output), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(source, { readOnly: true, timeout: 5000 });
try { await backup(db, output); console.log(JSON.stringify({ backup: output })); }
finally { db.close(); }
