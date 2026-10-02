import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

export function openDatabase(filename, migrations = resolve(import.meta.dirname, '../drizzle')) {
  mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(filename, { timeout: 5000 });
  try {
    database.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
    database.exec('CREATE TABLE IF NOT EXISTS hosting_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)');
    for (const name of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
      const sql = readFileSync(resolve(migrations, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = database.prepare('SELECT checksum FROM hosting_migrations WHERE name = ?').get(name);
      if (previous) {
        if (previous.checksum !== checksum) throw new Error(`Applied migration was changed: ${name}`);
        continue;
      }
      database.exec('BEGIN IMMEDIATE');
      try {
        database.exec(sql);
        database.prepare('INSERT INTO hosting_migrations (name, checksum) VALUES (?, ?)').run(name, checksum);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }
    const DB = {
      prepare(sql) {
        let values = [];
        return {
          bind(...args) { values = args; return this; },
          async first() { return database.prepare(sql).get(...values) || null; },
          async all() { return { results: database.prepare(sql).all(...values) }; },
          async run() { const result = database.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; },
        };
      },
    };
    return { DB, database, close() { database.close(); } };
  } catch (error) {
    database.close();
    throw error;
  }
}
