// Загрузка архивов текстур с ARCHITALON для scripts/lab-slabs-sync.mjs (команды download и sync).
//
// Как работает: открывается обычное видимое окно Chrome с отдельным локальным профилем (%LOCALAPPDATA%\italon-x2\architalon-profile,
// вне репозитория: пароль и cookies никуда не копируются). Пользователь сам входит на ARCHITALON, сам проходит проверку «Вы не робот?»,
// если она появится, и сам нажимает «Скачать» у нужных коллекций/цветов. Скрипт ничего не нажимает и не заполняет: он только
//   — показывает в консоли, каких слэбов ещё нет (по отчёту import), сгруппированных по коллекциям;
//   — принимает каждую загрузку, проверяет, что это ZIP или изображение, и сохраняет в папку загрузки под именем, данным сайтом;
//   — записывает происхождение (URL файла и страницы, дату, размер, sha256) в incoming/slabs/downloads.json — import кладёт его в provenance.
// Закройте окно браузера — загрузка закончится (в режиме sync сразу запустится import).
//
// Почему не полностью автоматически: портал требует входа, а автоматический заход на italonceramica.ru получает капчу. Обходить её,
// подбирать скрытые адреса или качать в обход интерфейса нельзя; разрешения на массовое скачивание у портала нет.
//
// Нужен Playwright: PLAYWRIGHT_PATH=<путь к пакету playwright> или `npm i --no-save playwright` (package.json не меняется).
// Браузер — установленный Chrome (--browser=chrome, по умолчанию), Edge (--browser=msedge) или Chromium из Playwright (--browser=chromium).
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, rename, unlink, stat, open } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, basename, extname } from 'node:path';
import { homedir } from 'node:os';

const START = 'https://www.italonceramica.ru/ru/architalon/';
const ACCEPT = new Set(['.zip', '.tif', '.tiff', '.jpg', '.jpeg', '.png', '.webp']);

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  for (const id of [process.env.PLAYWRIGHT_PATH, 'playwright'].filter(Boolean)) { try { return req(id); } catch { /* следующий вариант */ } }
  throw new Error('нет Playwright: выполните `npm i --no-save playwright` или задайте PLAYWRIGHT_PATH');
}

const sha256 = file => new Promise((ok, fail) => { const h = createHash('sha256'); createReadStream(file).on('data', d => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', fail); });
const safeName = s => basename(String(s || 'download')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+/, '').slice(0, 180) || 'download';

async function magicOk(file, ext) {
  const fh = await open(file); const b = Buffer.alloc(4);
  try { await fh.read(b, 0, 4, 0); } finally { await fh.close(); }
  if (ext === '.zip') return b[0] === 0x50 && b[1] === 0x4b;                       // PK
  if (ext === '.tif' || ext === '.tiff') return (b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4d && b[1] === 0x4d);
  if (ext === '.jpg' || ext === '.jpeg') return b[0] === 0xff && b[1] === 0xd8;
  if (ext === '.png') return b[0] === 0x89 && b[1] === 0x50;
  if (ext === '.webp') return b.toString('latin1') === 'RIFF';
  return false;
}

/** Что ещё нужно: слэбы без исходника по отчёту import, сгруппированные по коллекциям. */
function missingByCollection(targets, report) {
  const have = new Set((report?.rows || []).filter(r => r.status !== 'нет исходника').map(r => r.code));
  const groups = new Map();
  for (const t of targets) if (!have.has(t.code)) { if (!groups.has(t.collection)) groups.set(t.collection, []); groups.get(t.collection).push(t); }
  return groups;
}

// start, profile и session нужны проверке на локальном сервере; по умолчанию — ARCHITALON, профиль пользователя и ожидание закрытия окна.
export async function download({ dir, work, targets, report, browser = 'chrome', log = console.log, start = START, profile: profileDir, session = ctx => new Promise(ok => ctx.on('close', ok)) }) {
  const { chromium } = loadPlaywright();
  await mkdir(dir, { recursive: true }); await mkdir(work, { recursive: true });
  const stateFile = join(work, 'downloads.json'), state = existsSync(stateFile) ? JSON.parse(await readFile(stateFile, 'utf8')) : { v: 1, files: {} };
  const save = () => writeFile(stateFile, JSON.stringify(state, null, 2) + '\n');

  const missing = missingByCollection(targets, report);
  log(`Не хватает исходников: ${[...missing.values()].reduce((a, l) => a + l.length, 0)} из ${targets.length} слэбов.`);
  for (const [coll, list] of missing) log(`  ${coll}: ${list.map(t => t.name.replace(/\s*120X278.*$/i, '')).join(', ')}`);
  if (!report) log('  (отчёта ещё нет — сначала выполните import, чтобы список был точным)');
  log('');
  log('Откроется окно Chrome. Войдите на ARCHITALON (один раз — вход запомнится в локальном профиле), пройдите проверку, если она появится,');
  log(`и скачивайте архивы формата 120×278: лучше целиком коллекцию, иначе цвет. Файлы сохраняются в ${dir}.`);
  log('Закройте окно, когда все загрузки завершатся (незавершённые при закрытии не сохранятся).');

  const profile = profileDir || join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'italon-x2', 'architalon-profile');
  await mkdir(profile, { recursive: true });
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: false, acceptDownloads: true, viewport: null, locale: 'ru-RU',
    ...(browser === 'chromium' ? {} : { channel: browser }),
  });
  let queue = Promise.resolve(), count = 0;
  const onDownload = (page, dl) => { queue = queue.then(async () => {   // по одной: сохраняем строго последовательно
    const name = safeName(dl.suggestedFilename()), ext = extname(name).toLowerCase();
    if (!ACCEPT.has(ext)) { log(`пропущено ${name}: не архив и не изображение`); await dl.cancel().catch(() => {}); return; }
    const tmp = join(dir, `.part-${Date.now()}-${name}`);
    try {
      await dl.saveAs(tmp);
      const failure = await dl.failure(); if (failure) throw new Error(failure);
      if (!await magicOk(tmp, ext)) throw new Error('содержимое не соответствует расширению (возможно, сайт отдал страницу ошибки)');
      const st = await stat(tmp), hash = await sha256(tmp);
      let target = join(dir, name);
      if (existsSync(target)) {
        if (await sha256(target) === hash) { await unlink(tmp); log(`уже есть ${name} — дубликат не сохранён`); return; }
        target = join(dir, `${basename(name, ext)} (${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')})${ext}`);
      }
      await rename(tmp, target);
      state.files[basename(target)] = { url: dl.url(), page: page.url(), at: new Date().toISOString(), size: st.size, sha256: hash };
      await save(); count++;
      log(`сохранено ${basename(target)} (${(st.size / 1e6).toFixed(1)} МБ)`);
    } catch (e) {
      await unlink(tmp).catch(() => {}); log(`не сохранено ${name}: ${e.message}`);
    }
  }); };
  const watch = page => page.on('download', dl => onDownload(page, dl));
  ctx.pages().forEach(watch); ctx.on('page', watch);
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(start, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => log(`не открылась стартовая страница: ${e.message}`));
  const stop = () => ctx.close().catch(() => {});
  process.once('SIGINT', stop);
  await session(ctx);
  process.off('SIGINT', stop);
  await queue;
  await stop();
  log(`Загрузка закончена: новых файлов ${count}.`);
  return { count };
}
