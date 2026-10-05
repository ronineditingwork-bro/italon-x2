import { build } from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '.hosting-runtime/release');
await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, 'server'), { recursive: true });
// сайт (site/ → public/: страницы, assets, data/catalog.json) собирается перед копированием
await import('./build-site.mjs');
await cp(resolve(root, 'public'), resolve(output, 'public'), { recursive: true, filter: source => !source.endsWith('.site-manifest.json') });
await build({ entryPoints: [resolve(root, 'hosting/api-entry.mjs')], outfile: resolve(output, 'server/api.mjs'),
  bundle: true, format: 'esm', platform: 'node', target: 'node24', minify: true, legalComments: 'linked' });
for (const name of ['server.mjs', 'database.mjs', 'import-carts.mjs', 'backup.mjs']) {
  await cp(resolve(root, 'hosting', name), resolve(output, 'server', name));
}
for (const name of ['Dockerfile', 'compose.yaml', 'Caddyfile', '.env.example', '.dockerignore']) {
  await cp(resolve(root, 'hosting', name), resolve(output, name));
}
await cp(resolve(root, 'drizzle'), resolve(output, 'drizzle'), { recursive: true });
await cp(resolve(root, 'hosting/TRANSFER.md'), resolve(output, 'TRANSFER.md'));
const sourceFiles = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
const newFiles = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(name =>
  name.startsWith('hosting/') || ['scripts/build-hosting.mjs', 'tests/hosting.test.mjs'].includes(name));
for (const name of [...new Set([...sourceFiles, ...newFiles])]) {
  const destination = resolve(output, 'source', name);
  await mkdir(resolve(destination, '..'), { recursive: true });
  await cp(resolve(root, name), destination);
}
const files = [];
async function record(dir) {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const filename = resolve(dir, entry.name);
    if (entry.isDirectory()) await record(filename);
    else { const content = await readFile(filename); files.push({ path: relative(output, filename), bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') }); }
  }
}
await record(output);
await writeFile(resolve(output, 'release-manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(),
  sourceWorkingTreeChanged: execFileSync('git', ['status', '--porcelain'], { cwd: root }).toString().trim().length > 0,
  origin: 'https://italon-x2.ru', runtime: 'Node.js 24', files }, null, 2));
console.log(JSON.stringify({ output, files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0) }));
