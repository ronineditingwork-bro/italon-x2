// Сопоставление файла ARCHITALON (имя архива + имя внутри архива) с артикулом слэба из каталога.
// Названия в каталоге русские и часто сокращены («ШАР.ДЕЛ.Б.МИКЕЛ.»), в архивах — латиница («charme-deluxe-…»). Сравниваются «скелеты»
// слов: транслитерация, без гласных, похожие звуки сведены (c/k, z/s, ж/g перед e/i…). Правило осторожное:
//   — совпасть должны коллекция и ВСЕ слова названия (сокращение — по началу слова);
//   — формат в имени, если указан, должен быть 120×278;
//   — если подходят несколько артикулов одинаково хорошо, файл уходит в карантин, а не достаётся первому попавшемуся.

const RU = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'j', з: 's', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'kh', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'u', я: 'a' };
const collapse = s => s.replace(/(.)\1+/g, '$1');
const consonants = s => collapse(s.replace(/[aeiouy]/g, ''));

/** Скелеты русского слова (один вариант). */
function ruSkeletons(word) {
  return new Set([consonants([...word.toLowerCase()].map(ch => RU[ch] ?? ch).join(''))]);
}

/** Скелеты латинского слова: у неоднозначных сочетаний несколько прочтений (ch = к/ш/ч, w = в/у…). */
function latSkeletons(word) {
  let forms = [word.toLowerCase()];
  const alt = (re, ...subs) => { forms = forms.flatMap(f => f.search(re) >= 0 ? subs.map(s => f.replace(re, s)) : [f]); };
  alt(/wh/g, '', 'v');
  alt(/ch/g, 'k', 'sh', 'ch');
  alt(/gh/g, '', 'g');
  alt(/ph/g, 'f');
  alt(/sch/g, 'sh');
  alt(/ck/g, 'k');
  alt(/x/g, 'ks');
  alt(/q/g, 'k');
  alt(/w/g, 'v', '');
  alt(/j/g, 'j', 'y');
  alt(/g(?=[eiy])/g, 'g', 'j');                     // beige = беж, но tiger = тайгер
  return new Set(forms.map(f => consonants(f.replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/z/g, 's'))));
}

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Слово каталога { sk, abbr } совпадает со словом файла (набор скелетов)? */
function tokenMatch(t, src) {
  for (const s of src) for (const k of t.sk) {
    if (!k) continue;
    if (s === k || (t.abbr && s.startsWith(k))) return true;
    if (k.length >= 4 && s.length >= 4 && lev(s, k) <= 1) return true;
  }
  return false;
}

const STOP = new Set(['120x278', '278x120', 'люкс', 'рет', 'architalon']);
/** Слова названия товара: «ШАР.ДЕЛ.Б.МИКЕЛ.120X278 ЛЮКС» → шар. дел. б. микел. (точка после слова = сокращение). */
export function nameTokens(name) {
  const s = String(name).toLowerCase().replace(/(\d)\s*[хx×]\s*(\d)/g, '$1x$2').replace(/\d+x\d+/g, ' ');
  return [...s.matchAll(/([a-zа-яё]+)(\.?)/g)].filter(m => !STOP.has(m[1])).map(m => ({ word: m[1], abbr: !!m[2], sk: ruSkeletons(m[1]) }));
}

/** Слова имени файла и признаки: формат, фейс. */
export function sourceTokens(...parts) {
  const raw = parts.join(' ').toLowerCase().replace(/\.(zip|tiff?|jpe?g|png|webp)\b/g, ' ');
  const words = raw.split(/[^a-z0-9а-яё]+/).filter(Boolean);
  const formats = words.map(w => w.match(/^(\d{2,3})x(\d{2,3})$/)).filter(Boolean).map(m => `${m[1]}x${m[2]}`);
  const face = words.map(w => w.match(/^(?:f|face|фейс)(\d{1,2})$/)).find(Boolean);
  const skels = words.filter(w => /^[a-zа-яё]+$/.test(w) && !/^(?:f|face)\d*$/.test(w) && !STOP.has(w))
    .map(w => /[а-яё]/.test(w) ? ruSkeletons(w) : latSkeletons(w));
  return { words, formats, face: face ? `F${Number(face[1])}` : null, skels };
}

/** Подготовка артикулов: коллекция и «цветовые» слова названия (без сокращённого повтора коллекции). */
export function prepareTargets(items) {
  return items.map(it => {
    const coll = nameTokens(it.collection), toks = nameTokens(it.name);
    let i = 0;                                       // начало названия повторяет коллекцию («ШАР.ДЕЛ.» = ШАРМ ДЕЛЮКС, «СТАТУС» = СТАТУС)
    while (i < toks.length && i < coll.length && [...toks[i].sk].some(k => [...coll[i].sk].some(c => c.startsWith(k)))) i++;
    return { ...it, coll, colour: toks.slice(i) };
  });
}

/**
 * Сопоставление. Возвращает { status: 'match'|'ambiguous'|'none'|'other-format', code?, candidates, face, formats }.
 * targets — результат prepareTargets.
 */
export function matchSource(targets, archiveName, entryName = '') {
  const src = sourceTokens(archiveName, entryName), own = sourceTokens(entryName).formats;
  if (own.length) src.formats = own;                 // формат в имени файла важнее формата в имени архива («…-120x278.zip/…_60x120.tif» — не слэб)
  const base = { face: src.face, formats: src.formats, candidates: [] };
  if (src.formats.length && !src.formats.some(f => f === '120x278' || f === '278x120')) return { ...base, status: 'other-format' };
  const hits = [];
  for (const t of targets) {
    if (!t.coll.length || !t.colour.length) continue;
    if (!t.coll.every(c => src.skels.some(s => tokenMatch(c, s)))) continue;
    if (!t.colour.every(c => src.skels.some(s => tokenMatch(c, s)))) continue;
    hits.push({ code: t.code, score: t.coll.length + t.colour.length });
  }
  hits.sort((a, b) => b.score - a.score);
  const candidates = hits.map(h => h.code);
  if (!hits.length) return { ...base, status: 'none' };
  if (hits.length > 1 && hits[1].score === hits[0].score) return { ...base, status: 'ambiguous', candidates };
  return { ...base, status: 'match', code: hits[0].code, candidates };
}
