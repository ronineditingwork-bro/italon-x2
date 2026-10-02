import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { resolve } from 'node:path';
export function localDatabase(filename=':memory:'){
  const db=new DatabaseSync(filename);
  db.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
  const dir=resolve(import.meta.dirname,'../drizzle');
  for(const file of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort()){
    if(!db.prepare('SELECT name FROM local_migrations WHERE name = ?').get(file)){
      db.exec(readFileSync(resolve(dir,file),'utf8'));db.prepare('INSERT INTO local_migrations (name) VALUES (?)').run(file);
    }
  }
  const DB={prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){const r=db.prepare(sql).run(...values);return {meta:{changes:Number(r.changes)}};}};}};
  return {DB,close:()=>db.close()};
}
