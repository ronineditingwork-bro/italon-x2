import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing ${name}`);
  return args[index + 1];
}
const port = Number(option('--port', process.env.PORT || '4174'));
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
const host = option('--host', '127.0.0.1');
const origin = option('--origin', `http://localhost:${port}`);
process.env.PORT = String(port);
process.env.HOST = host;
process.env.APP_ORIGIN = origin;
process.env.NODE_ENV = 'development';
process.env.DB_PATH = resolve(root, '.hosting-runtime/dev/cart.sqlite');
await import('./build-hosting.mjs');
console.log(`Open ${origin}`);
await import('../.hosting-runtime/release/server/server.mjs');
