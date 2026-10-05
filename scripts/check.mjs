// Синтаксическая проверка исходников (npm run check): src, worker, hosting, scripts, site.
import { readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const files = [];
const walk = dir => { for (const name of readdirSync(dir)) { const f = resolve(dir, name); if (statSync(f).isDirectory()) walk(f); else if (/\.m?js$/.test(name)) files.push(f); } };
for (const dir of ['src', 'worker', 'hosting', 'scripts', 'site', 'tests']) walk(resolve(root, dir));
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log(`check: ${files.length} файлов без синтаксических ошибок`);
