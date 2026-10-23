// MATERIAL LAB: конвейер текстур слэбов 120×278 с ARCHITALON — одна команда из корня проекта, работает локально на Windows.
//
//   node scripts/lab-slabs-sync.mjs import      архивы и файлы из папки загрузки → проверка → WebP (десктоп + телефон) → public/media/lab + data/lab-originals.json
//   node scripts/lab-slabs-sync.mjs report      отчёт по всем слэбам каталога (без конвертации)
//   node scripts/lab-slabs-sync.mjs assign "<архив>|<файл внутри>" <артикул|skip>   ручное решение по файлу из карантина
//   node scripts/lab-slabs-sync.mjs links       incoming/slabs/links.md: недостающие коллекции, ссылки «Скачать текстуры с АРХИТАЛОН», посещённые страницы
//   node scripts/lab-slabs-sync.mjs browse      то же окно, что download, но скачивание отключено: только запись адресов открытых страниц
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
// Десктоп — родное разрешение исходника, но не больше 4615 px по длинной стороне (≈16,6 px/см; крупнее тормозит видеокарту и построение рельефа),
// качество 95, бюджет 7 МБ; телефон — 1400 px по ширине (≈1400×3243 у 120×278), качество 90, бюджет 1,5 МБ.
// Не уложились — качество снижается шагом 2, но не ниже 70. (Первые пять слэбов опубликованы со старыми настройками: q82/q78, 1,5 МБ / 400 КБ, телефон 2320 px.)
const ENCODE = { maxLong: 4615, mobileShort: 1400, mobileLong: 16000, desktopQ: 95, mobileQ: 90, floorQ: 70, desktopBudget: 7_000_000, mobileBudget: 1_500_000 };

const readJson = async (f, fallback) => existsSync(f) ? JSON.parse(await readFile(f, 'utf8')) : fallback;
const writeJson = async (f, v) => { await mkdir(resolve(f, '..'), { recursive: true }); await writeFile(f, JSON.stringify(v, null, 2) + '\n'); };
const mb = n => (n / 1e6).toFixed(2) + ' МБ';
const today = () => new Date().toISOString().slice(0, 10);
// Карты рельефа и структуры поверхности из архивов ARCHITALON (structure_120x278.tif, struttura_nat_…, poverkhnost_naturalnaya_…) — не рисунок плиты
const MAP_FILE = /(^|[^a-z])(structure|struttura|strukt\w*|poverkhnost\w*|surface|rilievo|relief|bump|normal|displace\w*|height|rough\w*)([^a-z]|$)/i;
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
    if (MAP_FILE.test(basename(entryName)) && !decisions[s.key]) { ignored.push({ key: s.key, reason: 'карта рельефа/структуры, не фейс плиты' }); continue; }
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
      let main = faces[0];
      const cur = man.items[t.code];
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
      // Основной фейс битый или не прошёл проверку — берём следующий настоящий фейс той же плиты (не карту, не копию), с пометкой в отчёте
      if (!sameMain && !(recs[main.face] && !recs[main.face].problems.length)) {
        for (const f of faces.slice(1)) {
          if (!recs[f.face]) {
            try { recs[f.face] = await convert(product, f, state, opt, log); } catch (e) { errors.push({ code: t.code, face: f.face, key: f.key, reason: e.message }); }
            await writeJson(STATE, state);
          }
          if (recs[f.face] && !recs[f.face].problems.length) { log(`${t.code}: фейс ${main.face} не годится, основным взят ${f.face}`); main = f; break; }
        }
      }
      if (!publish) continue;
      // Новый слэб публикуется только с явным --allow-publish (нужно письменное разрешение Italon); без него WebP остаются в incoming/slabs/out
      if (!cur && !opt['allow-publish']) { if (recs[main.face] && !recs[main.face].problems.length) log(`не опубликовано ${t.code}: новый слэб — нужен --allow-publish`); continue; }
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

// Адрес коллекции на italonceramica.ru, если он отличается от идентификатора в каталоге
const SITE_SLUG = { 'charme-deluxe': 'sharm-delyuks', 'charme-evo': 'sharm-evo' };

/** incoming/slabs/links.md: по коллекциям — что ещё нужно, официальная ссылка «Скачать текстуры с АРХИТАЛОН», страницы слэбов, посещённые и скачанные адреса. */
async function cmdLinks(log = console.log) {
  const pub = await readJson(join(WORK, 'public-pages.json'), { collections: [] }), report = await readJson(join(WORK, 'report.json'), null);
  const visited = (await readJson(join(WORK, 'visited.json'), { pages: {} })).pages, downloads = (await readJson(DOWNLOADS, { files: {} })).files;
  const status = new Map((report?.rows || []).map(r => [r.code, r.status])), items = slabTargets().items;
  const groups = [...new Set(items.map(t => t.collectionId))].map(id => ({ id, slug: SITE_SLUG[id] || id, items: items.filter(t => t.collectionId === id) }));
  const need = g => g.items.filter(t => (status.get(t.code) || 'нет исходника') === 'нет исходника');
  const todo = groups.filter(g => need(g).length), done = groups.filter(g => !need(g).length);
  const L = ['# ARCHITALON — страницы текстур 120×278', '',
    `Собрано ${new Date().toISOString().slice(0, 10)} командой \`node scripts/lab-slabs-sync.mjs links\`. Ничего не скачивалось и не нажималось.`, '',
    '- **Текстуры** — ссылка «Скачать текстуры с АРХИТАЛОН» с публичной страницы коллекции (взята из её href). Открывается после входа на портал; содержимое страницы без входа не проверялось.',
    '- **Посещено** — адреса, которые вы открывали в окне `browse`/`download` (после входа), с заголовком страницы.',
    `- Нужно коллекций: **${todo.length}**, слэбов без исходника: **${todo.reduce((a, g) => a + need(g).length, 0)}** из ${items.length}${report ? '' : ' (отчёта нет — выполните import)'}.`, ''];
  const section = (g, i) => {
    const p = pub.collections.find(c => c.slug === g.slug), seen = Object.entries(visited).filter(([u]) => u.includes(`/${g.slug}/`));
    const got = Object.entries(downloads).filter(([, d]) => (d.page || '').includes(`/${g.slug}/`) || (d.url || '').includes(g.slug));
    L.push(`## ${i}. ${g.items[0].collection} (${g.slug}) — нужно ${need(g).length} из ${g.items.length}`, '');
    L.push(`- Текстуры: ${p?.textures ? `<${p.textures}>` : 'ссылка не найдена — обновите public-pages.json'}`);
    if (p?.page) L.push(`- Коллекция: <${p.page}>`);
    L.push(`- Нужны: ${need(g).map(t => `${t.name.replace(/\s*120X278.*$/i, '')} (${t.code})`).join(', ') || '—'}`);
    const slabs = (p?.slabs || []).filter(u => /\/120x278-cm\/$/.test(u));
    if (slabs.length) L.push(`- Страницы слэбов: ${slabs.map(u => `<${u}>`).join(' · ')}`);
    for (const [u, v] of seen) {
      L.push(`- Посещено: <${u}> — «${v.title}» (${v.at.slice(0, 10)})`);
      const files = (v.links || []).filter(l => /120x278/i.test(l.href + ' ' + l.text));
      for (const l of files) L.push(`  - архив 120×278: ${l.text ? `${l.text} — ` : ''}<${l.href}>`);
      if (v.links && !files.length) L.push(`  - ссылок с «120x278» не найдено (всего ссылок на файлы: ${v.links.length})`);
    }
    for (const [f, d] of got) L.push(`- Скачано: ${f} ← <${d.url}>`);
    L.push('');
  };
  todo.forEach((g, i) => section(g, i + 1));
  if (done.length) { L.push('## Уже есть все слэбы', ''); done.forEach(g => L.push(`- ${g.items[0].collection} (${g.slug}): ${g.items.length} из ${g.items.length}`)); L.push(''); }
  await writeFile(join(WORK, 'links.md'), L.join('\n'));
  log(`Записано ${relative(root, join(WORK, 'links.md'))}: нужно ${todo.length} коллекций, посещённых страниц ${Object.keys(visited).length}.`);
}

/** Страницы «Скачать текстуры с АРХИТАЛОН» коллекций, где не хватает исходников (из public-pages.json и отчёта). */
async function textureUrls(only = null) {
  if (only) return only.map(s => s.trim()).filter(Boolean).map(s => `https://www.italonceramica.ru/ru/architalon/materialy-dlya-proektirovanya/${SITE_SLUG[s] || s}/tekstury/`);
  const pub = await readJson(join(WORK, 'public-pages.json'), { collections: [] }), report = await readJson(join(WORK, 'report.json'), null);
  const missing = new Set((report?.rows || []).filter(r => r.status === 'нет исходника').map(r => r.code));
  const ids = [...new Set(slabTargets().items.filter(t => !report || missing.has(t.code)).map(t => SITE_SLUG[t.collectionId] || t.collectionId))];
  return ids.map(id => pub.collections.find(c => c.slug === id)?.textures).filter(Boolean);
}

/** download --auto: прямые ссылки на архивы 120×278 из visited.json для слэбов без исходника (по отчёту), по одной на артикул. --limit=N — только первые N. */
async function autoQueue(opt) {
  const report = await readJson(join(WORK, 'report.json'), null), visited = (await readJson(join(WORK, 'visited.json'), { pages: {} })).pages;
  const missing = new Set((report?.rows || []).filter(r => r.status === 'нет исходника').map(r => r.code));
  const targets = prepareTargets(slabTargets().items), seen = new Set(), list = [];
  for (const p of Object.values(visited)) for (const l of p.links || []) {
    const name = basename(new URL(l.href).pathname);
    if (!/120x278/i.test(name) || !/\.zip$/i.test(name) || seen.has(l.href)) continue;
    const m = matchSource(targets, name, '');
    if (m.status !== 'match' || !missing.has(m.code) || list.some(x => x.code === m.code)) continue;
    seen.add(l.href); list.push({ url: l.href, name, code: m.code });
  }
  return opt.limit ? list.slice(0, Number(opt.limit)) : list;
}

async function cli() {
  const [cmd, ...rest] = process.argv.slice(2), { opt, pos } = parseArgs(rest);
  if (cmd === 'import') return cmdImport(opt);
  if (cmd === 'report') return cmdReport(opt);
  if (cmd === 'assign') return cmdAssign(pos);
  if (cmd === 'links') return cmdLinks();
  if (cmd === 'download' || cmd === 'sync' || cmd === 'browse') {
    const { download } = await import(pathToFileURL(resolve(root, 'scripts/lab-slabs-download.mjs')).href);
    const auto = cmd === 'download' && opt.auto ? await autoQueue(opt) : [];
    if (opt.auto && !auto.length) { console.log('очередь пуста: для недостающих слэбов нет ссылок в visited.json (сначала browse --visit)'); return; }
    const visit = cmd === 'browse' && opt.visit ? await textureUrls(typeof opt.visit === 'string' ? opt.visit.split(',') : null) : [];
    await download({ ...opt, browse: cmd === 'browse', visit, auto, dir: resolve(typeof opt.dir === 'string' ? opt.dir : DEFAULT_DIR), work: WORK, targets: slabTargets().items, report: (await readJson(join(WORK, 'report.json'), null)) });
    if (cmd === 'sync') return cmdImport(opt);
    return cmdLinks();
  }
  console.log('команды: import | report | links | assign "<архив>|<файл>" <артикул|skip> | browse | download | sync   (подробно — в начале файла)');
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) cli().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
