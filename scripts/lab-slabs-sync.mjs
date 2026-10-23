// MATERIAL LAB: конвейер текстур слэбов 120×278 с ARCHITALON — одна команда из корня проекта, работает локально на Windows.
//
//   node scripts/lab-slabs-sync.mjs import      архивы и файлы из папки загрузки → проверка → WebP (десктоп + телефон) → public/media/lab + data/lab-originals.json
//   node scripts/lab-slabs-sync.mjs report      отчёт по всем слэбам каталога (без конвертации)
//   node scripts/lab-slabs-sync.mjs assign "<архив>|<файл внутри>" <артикул|skip>   ручное решение по файлу из карантина
//   node scripts/lab-slabs-sync.mjs download    загрузка недостающих архивов с ARCHITALON в браузере пользователя (scripts/lab-slabs-download.cjs)
//   node scripts/lab-slabs-sync.mjs sync        download → import → report
//
// Параметры: --dir=<папка загрузки> (по умолчанию «Рабочий стол\Italon-x2\278»), --faces=all (конвертировать все фейсы, а не только основной),
// --publish-faces (публиковать и дополнительные фейсы), --no-publish (только локально, в incoming/slabs/out), --force (пересчитать заново),
// --max-total-mb=<лимит веса опубликованных оригиналов, по умолчанию 160>, --only=<артикул,артикул> (только эти слэбы), --python=<python.exe>.
//
// Исходники (ZIP/TIFF) не копируются в репозиторий: всё промежуточное лежит в incoming/slabs/ (в .gitignore). Публикуются только WebP.
// Соответствие файла артикулу — scripts/lab-slabs-match.mjs; неоднозначное или неизвестное уходит в карантин (см. report и assign).
// Повторный запуск не трогает то, что уже обработано: архивы узнаются по размеру и дате, записи — по CRC, опубликованные — по источнику.
import { readFile, writeFile, mkdir, readdir, stat, copyFile, unlink } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { resolve, join, relative, basename, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { slabTargets } from './lab-slab-targets.mjs';
import { prepareTargets, matchSource } from './lab-slabs-match.mjs';
import { checkOriginal } from '../site/shared/lab/catalog.mjs';
import { buildOriginals } from './lab-originals.mjs';

const run = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const WORK = resolve(root, 'incoming/slabs'), OUT = join(WORK, 'out');
const STATE = join(WORK, 'state.json'), DECISIONS = join(WORK, 'decisions.json'), DOWNLOADS = join(WORK, 'downloads.json');
const MANIFEST = resolve(root, 'data/lab-originals.json'), MEDIA = resolve(root, 'public/media/lab');
const WORKER = resolve(root, 'scripts/lab-slabs-image.py');
const DEFAULT_DIR = join(homedir(), 'Desktop', 'Italon-x2', '278');
const IMAGE_EXT = new Set(['.tif', '.tiff', '.jpg', '.jpeg', '.png', '.webp']);
// Бюджеты те же, что у первых пяти слэбов: десктоп — родное разрешение (≈16,6 px/см у ARCHITALON), не больше 4615 px по длинной стороне;
// телефон — 2320 px. Качество — наибольшее, при котором файл укладывается в бюджет, но не ниже 70.
const ENCODE = { maxLong: 4615, mobileLong: 2320, desktopQ: 82, mobileQ: 78, floorQ: 70, desktopBudget: 1_500_000, mobileBudget: 400_000 };

const readJson = async (f, fallback) => existsSync(f) ? JSON.parse(await readFile(f, 'utf8')) : fallback;
const writeJson = async (f, v) => { await mkdir(resolve(f, '..'), { recursive: true }); await writeFile(f, JSON.stringify(v, null, 2) + '\n'); };
const mb = n => (n / 1e6).toFixed(2) + ' МБ';
const today = () => new Date().toISOString().slice(0, 10);
const faceRank = f => /^F\d+$/.test(f) ? Number(f.slice(1)) : 100;

function parseArgs(argv) {
  const opt = {}, pos = [];
  for (const a of argv) { if (a.startsWith('--')) { const i = a.indexOf('='); i < 0 ? opt[a.slice(2)] = true : opt[a.slice(2, i)] = a.slice(i + 1); } else pos.push(a); }
  return { opt, pos };
}

async function walk(dir, out = []) {
  for (const d of await readdir(dir, { withFileTypes: true })) {
    if (d.name.startsWith('.')) continue;
    const p = join(dir, d.name);
    if (d.isDirectory()) await walk(p, out); else if (d.isFile()) out.push(p);
  }
  return out;
}

async function python(opt, args) {
  const exe = typeof opt.python === 'string' ? opt.python : process.env.LAB_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  try {
    const { stdout } = await run(exe, ['-E', '-P', WORKER, ...args], { maxBuffer: 64 << 20, windowsHide: true, cwd: WORK });
    return JSON.parse(stdout);
  } catch (e) {
    const msg = e.stdout ? (() => { try { return JSON.parse(e.stdout).error; } catch { return e.stdout; } })() : e.message;
    throw new Error(String(msg).trim());
  }
}

/** Все исходники из папки загрузки: [{ key, archive, entry, size, crc, date (дата получения файла), fp }] + отклонённые записи. */
async function scan(dir, state, opt, log) {
  const sources = [], rejected = [];
  const files = existsSync(dir) ? await walk(dir) : [];
  state.archives ||= {};
  for (const file of files) {
    const rel = relative(dir, file).split(sep).join('/'), ext = extname(file).toLowerCase(), st = await stat(file);
    if (ext === '.zip') {
      let cached = state.archives[rel];
      if (!cached || cached.size !== st.size || cached.mtimeMs !== st.mtimeMs) {
        log(`читаю оглавление ${rel}`);
        try { const r = await python(opt, ['list', file]); cached = state.archives[rel] = { size: st.size, mtimeMs: st.mtimeMs, entries: r.entries }; }
        catch (e) { rejected.push({ key: rel, reason: `архив не читается: ${e.message}` }); continue; }
      }
      for (const en of cached.entries) {
        const key = `${rel}|${en.name}`;
        if (!en.image) continue;
        if (en.reject) { rejected.push({ key, reason: en.reject }); continue; }
        sources.push({ key, archive: rel, entry: en.name, zip: file, size: en.size, crc: en.crc, date: new Date(st.mtimeMs).toISOString().slice(0, 10), fp: `zip:${en.crc}:${en.size}` });
      }
    } else if (IMAGE_EXT.has(ext)) {
      sources.push({ key: rel, archive: '', entry: rel, file, size: st.size, date: new Date(st.mtimeMs).toISOString().slice(0, 10), fp: `file:${st.size}:${Math.round(st.mtimeMs)}` });
    }
  }
  for (const k of Object.keys(state.archives)) if (!files.some(f => relative(dir, f).split(sep).join('/') === k)) delete state.archives[k];
  return { sources, rejected };
}

/** Распределение исходников по артикулам и фейсам; всё, что нельзя отнести уверенно, — в карантин. */
function assignSources(targets, sources, decisions) {
  const byCode = new Map(targets.map(t => [t.code, { faces: new Map(), duplicates: [] }]));
  const quarantine = [], ignored = [];
  for (const s of sources) {
    const archiveBase = s.archive ? basename(s.archive) : '', entryName = s.entry;
    const m = matchSource(targets, archiveBase, entryName.replace(/\//g, ' '));
    const manual = decisions[s.key];
    if (manual === 'skip') { ignored.push({ key: s.key, reason: 'пропущено вручную' }); continue; }
    if (m.status === 'other-format' && !manual) { ignored.push({ key: s.key, reason: `другой формат (${m.formats.join(', ')})` }); continue; }
    const code = manual || (m.status === 'match' ? m.code : null);
    if (!code || !byCode.has(code)) {
      quarantine.push({ key: s.key, reason: manual ? `решение «${manual}» — нет такого слэба в каталоге` : m.status === 'ambiguous' ? 'подходит нескольким артикулам' : 'не удалось определить артикул', candidates: m.candidates });
      continue;
    }
    const slot = byCode.get(code), seen = [...slot.faces.values()];
    const face = m.face || `V${seen.filter(x => !/^F\d+$/.test(x.face)).length + 1}`;
    if (seen.some(x => x.size === s.size && (x.crc && s.crc ? x.crc === s.crc : basename(x.entry) === basename(s.entry)))) { slot.duplicates.push(s.key); continue; }
    if (slot.faces.has(face)) { quarantine.push({ key: s.key, reason: `у ${code} уже есть фейс ${face} из другого файла: ${slot.faces.get(face).key}`, candidates: [code] }); continue; }
    slot.faces.set(face, { ...s, face, manual: !!manual });
  }
  return { byCode, quarantine, ignored };
}

const sourceUrlOf = s => `architalon:${s.archive ? `${basename(s.archive)}/${s.entry}` : s.entry}`;

async function convert(product, s, state, opt, log) {
  const key = `${product.code}/${s.face}`, prev = state.converted?.[key];
  const desktop = join(OUT, product.code, `${s.face}.webp`), mobile = join(OUT, product.code, `${s.face}-m.webp`);
  if (!opt.force && prev?.fp === s.fp && existsSync(desktop) && existsSync(mobile)) return prev;
  await mkdir(join(OUT, product.code), { recursive: true });
  log(`конвертирую ${product.code} ${s.face} ← ${s.key}`);
  const t0 = Date.now();
  const r = await python(opt, ['convert', JSON.stringify({ ...(s.zip ? { zip: s.zip, entry: s.entry } : { file: s.file }), desktop, mobile, ...ENCODE })]);
  const problems = ['desktop', 'mobile'].map(k => checkOriginal(product, { src: k, ...r[k] }) && `${k === 'desktop' ? 'десктоп' : 'телефон'}: ${checkOriginal(product, { src: k, ...r[k] })}`).filter(Boolean);
  const rec = { fp: s.fp, at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), ...r, problems };
  (state.converted ||= {})[key] = rec;
  if (problems.length) { await unlink(desktop).catch(() => {}); await unlink(mobile).catch(() => {}); }
  return rec;
}

async function publishFile(src, code, tag, sha256) {
  const name = `${code}${tag}-${sha256.slice(0, 8)}.webp`;
  await mkdir(MEDIA, { recursive: true });
  if (!existsSync(join(MEDIA, name))) await copyFile(src, join(MEDIA, name));
  return { file: name, sha256 };
}

function evidenceFor(product, s, rec) {
  const how = s.manual ? `соответствие артикулу «${product.name}» подтверждено вручную (decisions.json)` : `название и формат 120×278 в имени файла совпадают с артикулом «${product.name}»`;
  const mob = rec.mobile.height < rec.desktop.height ? `, мобильная ${rec.mobile.width}×${rec.mobile.height}` : '';
  return `Текстура ARCHITALON (Italon)${s.archive ? `, архив ${basename(s.archive)}` : ''}, файл ${basename(s.entry)}, фейс ${s.face}; ${how}. ` +
    `Исходник ${rec.srcWidth}×${rec.srcHeight} ${rec.mode}${rec.color === 'icc' ? ' (ICC → sRGB)' : ''}${rec.rotated ? ', повёрнут на 90°' : ''} → WebP: десктоп ${rec.desktop.width}×${rec.desktop.height}${mob}; без обрезки.`;
}

async function cmdImport(opt, log = console.log) {
  const dir = resolve(typeof opt.dir === 'string' ? opt.dir : DEFAULT_DIR);
  if (!existsSync(dir)) throw new Error(`нет папки загрузки ${dir} (укажите --dir=…)`);
  await mkdir(WORK, { recursive: true });
  const state = await readJson(STATE, { v: 1 }), decisions = await readJson(DECISIONS, {}), downloads = await readJson(DOWNLOADS, { files: {} });
  const data = await import(pathToFileURL(resolve(root, 'site/data.mjs')).href), productBy = new Map(data.products.map(p => [p.code, p]));
  const targets = prepareTargets(slabTargets(data.products).items);
  const { sources, rejected } = await scan(dir, state, opt, log);
  const { byCode, quarantine, ignored } = assignSources(targets, sources, decisions);
  const man = await readJson(MANIFEST, { v: 1, items: {} });
  const errors = [], allFaces = opt.faces === 'all', publish = !opt['no-publish'], limit = Number(opt['max-total-mb'] || 160) * 1e6;
  const only = typeof opt.only === 'string' ? new Set(opt.only.split(',')) : null;
  let published = 0;
  try {
    for (const t of targets) {
      const slot = byCode.get(t.code), product = productBy.get(t.code);
      const faces = [...slot.faces.values()].sort((a, b) => faceRank(a.face) - faceRank(b.face) || a.face.localeCompare(b.face));
      if (!faces.length || (only && !only.has(t.code))) continue;
      const main = faces[0], cur = man.items[t.code];
      const portalUrl = f => downloads.files?.[basename(f.archive || f.entry)]?.url || null;
      const provenance = f => ({ archive: f.archive ? basename(f.archive) : null, entry: f.entry, crc32: f.crc || null, size: f.size, acquiredOn: downloads.files?.[basename(f.archive || f.entry)]?.at?.slice(0, 10) || f.date, portalUrl: portalUrl(f), finish: t.finish, faces: faces.length });
      // Основной файл уже опубликован из этого же источника — не пересжимаем (иначе в Git появятся новые файлы без пользы).
      const sameMain = cur && cur.sourceUrl === sourceUrlOf(main) && !opt.force && existsSync(join(MEDIA, cur.file || ''));
      const toConvert = sameMain ? (allFaces ? faces.slice(1) : []) : (allFaces ? faces : [main]);
      const recs = {};
      for (const f of toConvert) {
        try { recs[f.face] = await convert(product, f, state, opt, log); if (recs[f.face].problems.length) errors.push({ code: t.code, face: f.face, key: f.key, reason: recs[f.face].problems.join('; ') }); }
        catch (e) { errors.push({ code: t.code, face: f.face, key: f.key, reason: e.message }); }
        await writeJson(STATE, state);                      // прогресс сохраняется после каждого файла: прерванный запуск продолжится с того же места
      }
      if (!publish) continue;
      const ok = f => recs[f.face] && !recs[f.face].problems.length;
      let entry = cur;
      if (!sameMain && ok(main)) {
        const r = recs[main.face];
        if (published + r.desktop.bytes + r.mobile.bytes > limit) { errors.push({ code: t.code, face: main.face, key: main.key, reason: `не опубликовано: превышен лимит веса ${mb(limit)}` }); continue; }
        entry = { file: (await publishFile(join(OUT, t.code, `${main.face}.webp`), t.code, '', r.desktop.sha256)).file, sha256: r.desktop.sha256,
          ...(r.mobile.height < r.desktop.height ? { mobile: await publishFile(join(OUT, t.code, `${main.face}-m.webp`), t.code, '-m', r.mobile.sha256) } : {}),   // исходник мельче 2320 px — копия для телефона не нужна
          face: main.face, sourceUrl: sourceUrlOf(main), evidence: evidenceFor(product, main, r), addedOn: today(), provenance: { ...provenance(main), sha256: r.sha256 } };
        published += r.desktop.bytes + (entry.mobile ? r.mobile.bytes : 0);
        log(`опубликовано ${t.code} ${main.face}: ${r.desktop.width}×${r.desktop.height} q${r.desktop.q} ${mb(r.desktop.bytes)}, ${entry.mobile ? `телефон q${r.mobile.q} ${mb(r.mobile.bytes)}` : 'копия для телефона не нужна'}${r.desktop.over || r.mobile.over ? ' — больше бюджета' : ''}`);
      } else if (entry && sameMain && !entry.provenance) {
        entry = { ...entry, face: entry.face || main.face, provenance: provenance(main) };   // запись, сделанная вручную раньше: дописываем происхождение, файлы не трогаем
      }
      if (entry && opt['publish-faces']) {
        const extra = [];
        for (const f of faces.slice(1)) {
          const r = recs[f.face] || (state.converted?.[`${t.code}/${f.face}`]?.fp === f.fp ? state.converted[`${t.code}/${f.face}`] : null);
          if (!r || r.problems?.length || !existsSync(join(OUT, t.code, `${f.face}.webp`))) continue;
          extra.push({ face: f.face, ...(await publishFile(join(OUT, t.code, `${f.face}.webp`), t.code, `-${f.face.toLowerCase()}`, r.desktop.sha256)),
            ...(r.mobile.height < r.desktop.height ? { mobile: await publishFile(join(OUT, t.code, `${f.face}-m.webp`), t.code, `-${f.face.toLowerCase()}-m`, r.mobile.sha256) } : {}), sourceUrl: sourceUrlOf(f) });
        }
        if (extra.length) entry = { ...entry, faces: extra };
      }
      if (entry && entry !== cur) man.items[t.code] = entry;
    }
  } finally {
    await writeJson(STATE, state);
  }
  if (publish) {
    await writeJson(MANIFEST, man);
    const keep = new Set(Object.values(man.items).flatMap(o => [o.file, o.mobile?.file, ...(o.faces || []).flatMap(f => [f.file, f.mobile?.file])]).filter(Boolean));
    for (const f of existsSync(MEDIA) ? await readdir(MEDIA) : []) {   // старые версии файлов этих же артикулов (после замены источника)
      const code = f.match(/^(\d{12})-/)?.[1];
      if (code && byCode.has(code) && !keep.has(f)) { await unlink(join(MEDIA, f)); log(`удалён устаревший ${f}`); }
    }
  }
  state.lastImport = { at: new Date().toISOString(), dir, quarantine, rejected, ignored, errors, duplicates: Object.fromEntries([...byCode].filter(([, v]) => v.duplicates.length).map(([k, v]) => [k, v.duplicates])),
    found: Object.fromEntries([...byCode].filter(([, v]) => v.faces.size).map(([k, v]) => [k, [...v.faces.values()].map(f => ({ face: f.face, key: f.key, fp: f.fp }))])) };
  await writeJson(STATE, state);
  return cmdReport(opt, log);
}

async function cmdReport(opt, log = console.log) {
  const state = await readJson(STATE, { v: 1 }), last = state.lastImport || {};
  const data = await import(pathToFileURL(resolve(root, 'site/data.mjs')).href);
  const targets = slabTargets(data.products).items, man = await readJson(MANIFEST, { v: 1, items: {} });
  const checked = await buildOriginals({ products: data.products });
  const size = f => f && existsSync(join(MEDIA, f)) ? statSync(join(MEDIA, f)).size : 0;
  const rows = [];
  for (const t of targets) {
    const found = last.found?.[t.code] || [], m = man.items[t.code], live = checked.items[t.code];
    const conv = found.map(f => state.converted?.[`${t.code}/${f.face}`]).filter(r => r && !r.problems?.length);
    const errs = (last.errors || []).filter(e => e.code === t.code);
    const weight = m ? [m.file, m.mobile?.file, ...(m.faces || []).flatMap(f => [f.file, f.mobile?.file])].reduce((a, f) => a + size(f), 0) : 0;
    const status = live ? 'опубликован' : conv.length ? 'готов к публикации' : found.length ? (errs.length ? 'ошибка' : 'найден, не конвертирован') : 'нет исходника';
    rows.push({ code: t.code, collection: t.collection, name: t.name, status, faces: found.map(f => f.face).sort((a, b) => faceRank(a) - faceRank(b) || a.localeCompare(b)).join(' '), facesPublished: live ? 1 + (live.faces?.length || 0) : 0,
      source: conv[0] ? `${conv[0].srcWidth}×${conv[0].srcHeight}` : '', published: live ? `${live.width}×${live.height}` : '', weight, errors: errs.map(e => `${e.face}: ${e.reason}`).join('; ') });
  }
  const count = s => rows.filter(r => r.status === s).length, total = rows.reduce((a, r) => a + r.weight, 0);
  const summary = { at: new Date().toISOString(), total: rows.length, published: count('опубликован'), ready: count('готов к публикации'), found: rows.filter(r => r.faces).length,
    missing: count('нет исходника'), errors: count('ошибка'), quarantine: (last.quarantine || []).length, rejected: (last.rejected || []).length, weightBytes: total };
  await writeJson(join(WORK, 'report.json'), { summary, rows, quarantine: last.quarantine || [], rejected: last.rejected || [], ignored: last.ignored || [], errors: last.errors || [] });
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"', cols = ['code', 'collection', 'name', 'status', 'faces', 'facesPublished', 'source', 'published', 'weight', 'errors'];
  await writeFile(join(WORK, 'report.csv'), '\uFEFF' + [cols.map(q).join(','), ...rows.map(r => cols.map(c => q(r[c])).join(','))].join('\r\n') + '\r\n');
  log('');
  for (const r of rows) log(`${r.code}  ${r.name.padEnd(36)} ${r.status.padEnd(26)} ${r.faces ? 'фейсы ' + r.faces : ''}${r.weight ? '  ' + mb(r.weight) : ''}${r.errors ? '  ⚠ ' + r.errors : ''}`);
  log('');
  log(`Слэбов в каталоге: ${summary.total}. Исходники найдены: ${summary.found}, опубликовано: ${summary.published}, готово к публикации: ${summary.ready}, без исходника: ${summary.missing}, с ошибками: ${summary.errors}.`);
  log(`Карантин: ${summary.quarantine}, отклонено проверкой архива: ${summary.rejected}. Вес опубликованных оригиналов: ${mb(total)}.`);
  for (const x of last.quarantine || []) log(`  карантин: ${x.key} — ${x.reason}${x.candidates?.length ? ` (варианты: ${x.candidates.join(', ')})` : ''}`);
  for (const x of last.rejected || []) log(`  отклонено: ${x.key} — ${x.reason}`);
  if ((last.quarantine || []).length) log(`Решение по файлу: node scripts/lab-slabs-sync.mjs assign "<архив>|<файл>" <артикул|skip>`);
  log(`Отчёт: ${relative(root, join(WORK, 'report.csv'))}, ${relative(root, join(WORK, 'report.json'))}`);
  return summary;
}

async function cmdAssign(pos) {
  const [key, code] = pos;
  if (!key || !code) throw new Error('использование: assign "<архив>|<файл внутри>" <артикул|skip>');
  if (code !== 'skip' && !slabTargets().items.some(t => t.code === code)) throw new Error(`${code} — не слэб 120×278 из каталога`);
  const d = await readJson(DECISIONS, {}); d[key] = code; await writeJson(DECISIONS, d);
  console.log(`записано: ${key} → ${code}. Запустите import.`);
}

async function cli() {
  const [cmd, ...rest] = process.argv.slice(2), { opt, pos } = parseArgs(rest);
  if (cmd === 'import') return cmdImport(opt);
  if (cmd === 'report') return cmdReport(opt);
  if (cmd === 'assign') return cmdAssign(pos);
  if (cmd === 'download' || cmd === 'sync') {
    const { download } = await import(pathToFileURL(resolve(root, 'scripts/lab-slabs-download.mjs')).href);
    await download({ ...opt, dir: resolve(typeof opt.dir === 'string' ? opt.dir : DEFAULT_DIR), work: WORK, targets: slabTargets().items, report: (await readJson(join(WORK, 'report.json'), null)) });
    if (cmd === 'sync') return cmdImport(opt);
    return;
  }
  console.log('команды: import | report | assign "<архив>|<файл>" <артикул|skip> | download | sync   (подробно — в начале файла)');
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) cli().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
