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

/** Что видно на странице: вход, капча, ссылки на файлы (только href — ничего не нажимается). */
const scanPage = page => page.evaluate(() => ({
  url: location.href, title: document.title,
  captcha: /showcaptcha|smartcaptcha/i.test(location.href) || /Вы не робот/i.test(document.title),
  loginForm: !!document.querySelector('input[type=password]') && !/Выйти|Выход|Logout/i.test(document.body.innerText),
  links: [...new Map([...document.querySelectorAll('a[href]')]
    .filter(a => /\.(zip|rar|7z|tiff?|jpe?g|png)(\?|$)|download|скач/i.test(a.getAttribute('href') + ' ' + a.textContent))
    .map(a => [a.href, (a.textContent || a.title || '').trim().replace(/\s+/g, ' ').slice(0, 120)])).entries()].map(([href, text]) => ({ href, text })),
}));

/**
 * Режим browse --visit: по очереди открыть страницы текстур (обычный переход по адресу, пауза 6–10 с) и записать ссылки на архивы.
 * Капча или форма входа — ждём, пока пользователь сам пройдёт их в окне (до 15 минут), потом продолжаем. Ничего не нажимается и не скачивается.
 */
async function visitPages(ctx, page, urls, visited, visitedFile, log) {
  const wait = ms => new Promise(ok => setTimeout(ok, ms));
  const waitUser = async (url, why) => {
    log(`  ${why} — выполните это в окне браузера, продолжу сам (жду до 15 минут)`);
    for (let i = 0; i < 180; i++) {
      await wait(5000); if (page.isClosed()) return false;
      const s = await scanPage(page).catch(() => null);
      if (s && !s.captcha && !s.loginForm) { if (!s.url.startsWith(url)) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {}); return true; }
    }
    return false;
  };
  for (const [i, url] of urls.entries()) {
    if (page.isClosed()) { log('окно закрыто — обход остановлен'); return; }
    log(`(${i + 1}/${urls.length}) ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => log(`  не открылась: ${e.message}`));
    await wait(3000);
    let s = await scanPage(page).catch(() => null);
    if (s?.captcha && !await waitUser(url, 'проверка «Вы не робот?»')) return log('проверка не пройдена — обход остановлен');
    s = await scanPage(page).catch(() => null);
    if (s?.loginForm && !await waitUser(url, 'нужен вход на ARCHITALON')) return log('вход не выполнен — обход остановлен');
    await wait(2000); s = await scanPage(page).catch(() => null);
    if (!s) { log('  страница не прочиталась'); continue; }
    visited.pages[url] = { title: s.title, at: new Date().toISOString(), finalUrl: s.url, links: s.links };
    await writeFile(visitedFile, JSON.stringify(visited, null, 2) + '\n');
    log(`  «${s.title}», ссылок на файлы: ${s.links.length} (120×278: ${s.links.filter(l => /120x278/i.test(l.href + l.text)).length})`);
    await wait(6000 + Math.round(Math.random() * 4000));
  }
  log('Обход закончен. Можно закрыть окно.');
}

// start, profile и session нужны проверке на локальном сервере; по умолчанию — ARCHITALON, профиль пользователя и ожидание закрытия окна.
export async function download({ dir, work, targets, report, browser = 'chrome', log = console.log, start = START, browse = false, visit = [], auto = [], profile: profileDir, session = ctx => new Promise(ok => ctx.on('close', ok)) }) {
  const { chromium } = loadPlaywright();
  await mkdir(dir, { recursive: true }); await mkdir(work, { recursive: true });
  const stateFile = join(work, 'downloads.json'), state = existsSync(stateFile) ? JSON.parse(await readFile(stateFile, 'utf8')) : { v: 1, files: {} };
  const save = () => writeFile(stateFile, JSON.stringify(state, null, 2) + '\n');

  const missing = missingByCollection(targets, report);
  log(`Не хватает исходников: ${[...missing.values()].reduce((a, l) => a + l.length, 0)} из ${targets.length} слэбов.`);
  for (const [coll, list] of missing) log(`  ${coll}: ${list.map(t => t.name.replace(/\s*120X278.*$/i, '')).join(', ')}`);
  if (!report) log('  (отчёта ещё нет — сначала выполните import, чтобы список был точным)');
  log('');
  log('Откроется окно Chrome. Войдите на ARCHITALON (один раз — вход запомнится в локальном профиле), пройдите проверку, если она появится.');
  if (browse) log('Режим browse: скачивание отключено, записываются только адреса открытых страниц (incoming/slabs/visited.json). Закройте окно, когда закончите.');
  else {
    log(`Скачивайте архивы формата 120×278: лучше целиком коллекцию, иначе цвет. Файлы сохраняются в ${dir}.`);
    log('Закройте окно, когда все загрузки завершатся (незавершённые при закрытии не сохранятся).');
  }

  const profile = profileDir || join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'italon-x2', 'architalon-profile');
  await mkdir(profile, { recursive: true });
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: false, acceptDownloads: !browse, viewport: null, locale: 'ru-RU',
    ...(browser === 'chromium' ? {} : { channel: browser }),
  });
  let queue = Promise.resolve(), count = 0, lastOutcome = null;
  const onDownload = (page, dl) => { queue = queue.then(async () => {   // по одной: сохраняем строго последовательно
    const name = safeName(dl.suggestedFilename()), ext = extname(name).toLowerCase();
    lastOutcome = { name, url: dl.url(), ok: false, reason: 'не завершено' };
    if (!ACCEPT.has(ext)) { lastOutcome.reason = 'не архив и не изображение'; log(`пропущено ${name}: не архив и не изображение`); await dl.cancel().catch(() => {}); return; }
    const tmp = join(dir, `.part-${Date.now()}-${name}`);
    try {
      await dl.saveAs(tmp);
      const failure = await dl.failure(); if (failure) throw new Error(failure);
      if (!await magicOk(tmp, ext)) throw new Error('содержимое не соответствует расширению (возможно, сайт отдал страницу ошибки)');
      const st = await stat(tmp), hash = await sha256(tmp);
      let target = join(dir, name);
      if (existsSync(target)) {
        if (await sha256(target) === hash) { await unlink(tmp); Object.assign(lastOutcome, { ok: true, reason: 'дубликат' }); log(`уже есть ${name} — дубликат не сохранён`); return; }
        target = join(dir, `${basename(name, ext)} (${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')})${ext}`);
      }
      await rename(tmp, target);
      state.files[basename(target)] = { url: dl.url(), page: page.url(), at: new Date().toISOString(), size: st.size, sha256: hash };
      await save(); count++; Object.assign(lastOutcome, { ok: true, reason: '', file: basename(target), size: st.size });
      log(`сохранено ${basename(target)} (${(st.size / 1e6).toFixed(1)} МБ)`);
    } catch (e) {
      lastOutcome.reason = e.message;
      await unlink(tmp).catch(() => {}); log(`не сохранено ${name}: ${e.message}`);
    }
  }); };
  // Посещённые страницы портала — для incoming/slabs/links.md (команда links): адрес, заголовок, время; ничего не нажимается и не читается со страницы, кроме заголовка
  const visitedFile = join(work, 'visited.json'), visited = existsSync(visitedFile) ? JSON.parse(await readFile(visitedFile, 'utf8')) : { v: 1, pages: {} };
  const remember = async page => {
    const url = page.url(); if (!/^https:\/\/[^/]*italonceramica\.ru\//.test(url) || /showcaptcha/.test(url)) return;
    const title = await page.title().catch(() => '');
    const key = url.split('#')[0];
    visited.pages[key] = { ...visited.pages[key], title, at: new Date().toISOString() };   // дополняем: ссылки, собранные обходом, не затираются
    await writeFile(visitedFile, JSON.stringify(visited, null, 2) + '\n');
  };
  const watch = page => {
    page.on('download', dl => browse ? (log(`скачивание отключено (режим browse): ${dl.suggestedFilename()}`), dl.cancel().catch(() => {})) : onDownload(page, dl));
    page.on('load', () => remember(page).catch(() => {}));
  };
  ctx.pages().forEach(watch); ctx.on('page', watch);
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(start, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => log(`не открылась стартовая страница: ${e.message}`));
  const stop = () => ctx.close().catch(() => {});
  process.once('SIGINT', stop);
  if (visit.length) await visitPages(ctx, page, visit, visited, visitedFile, log);
  if (auto.length) {
    // Очередь прямых ссылок (с разрешения пользователя): по одному файлу, пауза 20–30 с; при любой ошибке, капче или входе — стоп
    const wait = ms => new Promise(ok => setTimeout(ok, ms));
    for (const [i, item] of auto.entries()) {
      if (existsSync(join(dir, item.name))) { log(`(${i + 1}/${auto.length}) уже есть ${item.name} — пропуск`); continue; }
      log(`(${i + 1}/${auto.length}) ${item.name}`);
      lastOutcome = null;
      const started = page.waitForEvent('download', { timeout: 60000 }).then(() => true, () => false);
      await page.goto(item.url, { timeout: 60000 }).catch(() => {});        // ссылка на файл: браузер начинает скачивание, переход «обрывается» — это нормально
      if (!await started) {
        const s = await scanPage(page).catch(() => null);
        const why = s?.captcha ? 'проверка «Вы не робот?»' : s?.loginForm ? 'сайт просит войти' : `скачивание не началось за 60 с (страница: ${s?.url || '?'} «${s?.title || ''}»)`;
        log(`ОСТАНОВЛЕНО: ${why}`); break;
      }
      await wait(500); await queue;                                            // ждём, пока файл докачается и пройдёт проверку
      if (!lastOutcome?.ok) { log(`ОСТАНОВЛЕНО: ${item.name} — ${lastOutcome?.reason || 'нет результата'}`); break; }
      if (lastOutcome.file && lastOutcome.file !== item.name) log(`  сайт отдал файл под именем ${lastOutcome.file}`);
      if (i < auto.length - 1) { const p = 20000 + Math.round(Math.random() * 10000); log(`  пауза ${Math.round(p / 1000)} с`); await wait(p); }
    }
    log('Очередь закончена.');
  } else await session(ctx);
  process.off('SIGINT', stop);
  await queue;
  await stop();
  log(browse ? `Просмотр закончен: записано страниц ${Object.keys(visited.pages).length}.` : `Загрузка закончена: новых файлов ${count}.`);
  return { count };
}
