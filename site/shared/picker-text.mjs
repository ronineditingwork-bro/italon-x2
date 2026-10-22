// Подбор керамогранита по описанию на обычном языке («светло-серый под бетон, матовый, 60×120, до 5000 ₽, для террасы»).
// Без внешних сервисов и платных API: правила разбора русского текста + данные каталога + признаки внешнего вида фото (picker-features.mjs).
// Чистые функции (работают и в браузере, и в Node для тестов):
//   parseQuery(text)                      → что хочет посетитель: цвета, тон, рисунок, поверхность, формат, цену, раздел, слова из названий
//   attributesOf(product, features)       → описание плитки: цвет (L*, C*, h), рисунок (прожилки, дерево, камень, бетон, однотонная…)
//   searchByText(text, products, attrsOf) → { results, relaxed, notes, query }; в каждом результате score и причины («почему показано»)
import { lower } from './format.mjs';

const ё = s => String(s ?? '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
// мягкая «трапеция»: 0 вне [a,d], 1 на [b,c]
const trap = (v, a, b, c, d) => v <= a || v >= d ? 0 : v < b ? (v - a) / (b - a) : v <= c ? 1 : (d - v) / (d - c);
const hueDist = (h1, h2) => { const d = Math.abs(h1 - h2) % 360; return d > 180 ? 360 - d : d; };

// ------------------------------------------------------------------------------------------------ словарь
// Цвета. Каждый — функция принадлежности по среднему цвету плитки (L* светлота 0–100, C* насыщенность, h — оттенок 0–360 в L*a*b*).
// Значения подобраны по снимкам каталога; проверяются tests/picker.test.mjs.
export const COLORS = {
  white:  { label: 'белый',        fit: ({ L, C }) => trap(L, 76, 86, 100, 101) * trap(C, -1, 0, 7, 12) },
  ivory:  { label: 'молочный, слоновая кость', fit: ({ L, C, h }) => trap(L, 72, 82, 100, 101) * trap(C, 4, 7, 20, 28) * trap(h, 55, 70, 110, 125) },
  beige:  { label: 'бежевый',      fit: ({ L, C, h }) => trap(L, 50, 62, 86, 92) * trap(C, 6, 10, 26, 34) * trap(h, 45, 62, 100, 118) },
  sand:   { label: 'песочный',     fit: ({ L, C, h }) => trap(L, 55, 65, 85, 92) * trap(C, 10, 15, 30, 40) * trap(h, 55, 70, 100, 115) },
  greige: { label: 'серо-бежевый', fit: ({ L, C, h }) => trap(L, 45, 55, 80, 88) * trap(C, 3, 5, 11, 15) * trap(h, 40, 60, 110, 130) },
  gray:   { label: 'серый',        fit: ({ L, C }) => trap(L, 25, 38, 80, 88) * trap(C, -1, 0, 7, 11) },
  lightgray: { label: 'светло-серый', fit: ({ L, C }) => trap(L, 60, 70, 88, 95) * trap(C, -1, 0, 8, 12) },
  darkgray:  { label: 'тёмно-серый, графит', fit: ({ L, C }) => trap(L, 10, 18, 42, 52) * trap(C, -1, 0, 8, 12) },
  black:  { label: 'чёрный',       fit: ({ L, C }) => trap(L, -1, 0, 24, 34) * trap(C, -1, 0, 12, 20) },
  brown:  { label: 'коричневый',   fit: ({ L, C, h }) => trap(L, 12, 22, 55, 66) * trap(C, 7, 11, 40, 55) * trap(h, 20, 35, 85, 100) },
  taupe:  { label: 'кофейный, мокко', fit: ({ L, C, h }) => trap(L, 28, 38, 62, 72) * trap(C, 4, 7, 20, 28) * trap(h, 30, 45, 95, 110) },
  green:  { label: 'зелёный',      fit: ({ L, C, h }) => trap(C, 4, 8, 90, 100) * trap(h, 100, 125, 180, 205) * trap(L, 8, 18, 85, 98) },
  olive:  { label: 'оливковый',    fit: ({ L, C, h }) => trap(C, 6, 10, 40, 55) * trap(h, 85, 98, 130, 150) * trap(L, 20, 30, 70, 85) },
  blue:   { label: 'синий, голубой', fit: ({ L, C, h }) => trap(C, 4, 8, 90, 100) * trap(h, 220, 245, 310, 335) * trap(L, 10, 20, 90, 99) },
  teal:   { label: 'бирюзовый, петрольный', fit: ({ L, C, h }) => trap(C, 5, 9, 60, 80) * trap(h, 175, 195, 245, 265) * trap(L, 10, 20, 85, 98) },
  red:    { label: 'красный, терракотовый', fit: ({ L, C, h }) => trap(C, 14, 22, 90, 100) * trap(hueDist(h, 35), -1, 0, 28, 48) * trap(L, 15, 28, 75, 90) },
  pink:   { label: 'розовый',      fit: ({ L, C, h }) => trap(C, 5, 9, 40, 60) * trap(hueDist(h, 15), -1, 0, 22, 40) * trap(L, 55, 68, 96, 100) },
  yellow: { label: 'жёлтый, золотой', fit: ({ L, C, h }) => trap(C, 22, 30, 100, 110) * trap(h, 78, 88, 108, 125) * trap(L, 45, 60, 95, 100) },
};
// слова → цвета (регулярки по началу слова после нормализации; ё → е)
const COLOR_WORDS = [
  [/^бел|^white|^уайт|^снежн|^блан|^биан/, ['white']],
  [/^молочн|^слонов|^айвори|^ivory|^ванил|^кремов|^крем$|^крим|^cream/, ['ivory']],
  [/^беж|^beige/, ['beige']], [/^песоч|^сэнд|^sand|^дюн/, ['sand']], [/^серо-?беж|^грейдж|^greige|^тауп|^taupe/, ['greige']],
  [/^светло-?сер|^сер(ебрист|ебр)/, ['lightgray']], [/^сер(ый|ая|ое|ые|ого|ому|ым|ыми|их|ых|ой|ую|ою|ом)?$|^грэй$|^грей$|^gr[ae]y|^пепел|^дым|^фуме|^fog$|^фог$|^стальн|^цемент(н)?ый/, ['gray']],
  [/^графит|^антрацит|^темно-?сер|^dark-?gr|^угольн/, ['darkgray']],
  [/^черн|^блэк|^блек|^black|^нуар|^noir|^ночн|^ониксов/, ['black']],
  [/^коричн|^шоколад|^браун|^brown|^орех|^каштан|^тик$|^темно-?корич/, ['brown']], [/^кофе|^кофей|^мокко|^мока|^капучин|^какао/, ['taupe']],
  [/^зелен|^green|^грин|^изумруд|^малахит|^мят|^шалфей|^хаки/, ['green']], [/^оливк|^olive/, ['olive']],
  [/^син|^голуб|^blue|^блю|^лазур|^небесн|^индиго|^деним/, ['blue']], [/^бирюз|^петрол|^petrol|^тил|^teal|^аквамарин|^морск/, ['teal']],
  [/^красн|^рэд|^red|^терракот|^терракот|^кирпич|^бордо|^вишн|^рыжи|^ржав|^кортен|^медн/, ['red']],
  [/^розов|^pink|^пудр|^персик|^коралл|^лососев/, ['pink']], [/^желт|^золот|^gold|^голд|^горчич|^янтар|^медов|^лимонн/, ['yellow']],
];
// приставки сложных прилагательных: «бело-серый» → белый + серый
const COMPOUND = [[/^бело$/, 'white'], [/^серо$/, 'gray'], [/^черно$/, 'black'], [/^бежево$/, 'beige'], [/^коричнево$/, 'brown'], [/^зелено$/, 'green'], [/^сине$|^голубо$/, 'blue'], [/^красно$/, 'red'], [/^желто$/, 'yellow'], [/^молочно$/, 'ivory'], [/^кремово$/, 'ivory']];

// Тон
const TONES = [
  [/^светл|^светло$|^ярк[оа]-?бел|^пастельн|^нежн|^воздушн|^light$|^лайт$/, 'light'],
  [/^темн|^темно$|^dark$|^дарк$|^насыщен|^глубок/, 'dark'],
  [/^тепл|^уютн|^солнечн|^нагрет|^теплом/, 'warm'], [/^холодн|^прохладн|^стальн|^ледян|^морозн|^cold$/, 'cool'],
  [/^нейтральн|^спокойн|^сдержан/, 'neutral'], [/^ярк(ий|ая|ое|ие|о)?$|^сочн|^контрастн|^цветн/, 'vivid'], [/^приглушен|^пыльн|^матов(ый)? цвет|^выцвет|^мягк/, 'muted'],
];
// Рисунок и материал
const LOOKS = {
  marble:   { label: 'мрамор, прожилки', re: /^мрамор|^marble|^прожил|^калакат|^каррар|^статуари|^империал|^кальк[аы]тт|^арабескат|^панда$|^эмперадор|^травертин(о)?вые прожил|^белый мрамор/ },
  wood:     { label: 'дерево', re: /^дерев|^wood|^вуд$|^паркет|^доск|^дуб(ов)?|^oak$|^оак$|^орех|^тик$|^ясень|^древесн|^ламинат|^рейк|^планк|^брус/ },
  stone:    { label: 'камень', re: /^камен|^stone|^стоун$|^сланц|^slate|^гранит|^гальк|^известняк|^песчаник|^кварцит|^базальт|^природн|^натурал(ьн)? камень|^скал|^ардез|^ардуаз|^pietra|^пьетр/ },
  concrete: { label: 'бетон, цемент', re: /^бетон|^цемент|^микроцемент|^concrete|^cement|^лофт|^loft|^индустриал|^штукатурк|^известков|^глин/ },
  metal:    { label: 'металл, корten', re: /^металл|^metal|^корten|^кортен|^железн|^iron|^айрон|^ржав|^сталь|^бронз|^латун|^медн|^стальн/ },
  travertine: { label: 'травертин', re: /^травертин|^travertin|^травертин/ },
  onyx:     { label: 'оникс', re: /^оникс|^onyx|^полупрозрачн|^просвечив/ },
  terrazzo: { label: 'терраццо, крошка', re: /^терраццо|^terrazzo|^крошк|^мозаичн(ая)? крошк|^конгломерат|^инкрустац/ },
  plain:    { label: 'однотонная, без рисунка', re: /^однотон|^моно(хром)?|^без рисунк|^гладк(ий|ая|ое|ие)?$|^простой|^монохромн|^равномерн|^ровн(ый|ая|ое) цвет/ },
  textile:  { label: 'ткань, текстиль', re: /^ткан|^текстил|^лен$|^льнян|^cotton|^коттон|^рогожк|^плетен|^фактурн(ая)? ткан/ },
  pattern:  { label: 'узор, орнамент', re: /^узор|^орнамент|^цветочн|^принт|^геометр|^рисунок$|^pattern|^флорал|^мозаика-узор|^майолик|^лоскутн|^пэчворк|^пэчворк/ },
};
// Стиль → набор пожеланий
const STYLES = [
  [/^лофт|^loft|^индустриальн/, { label: 'лофт', looks: ['concrete'], colors: ['gray', 'darkgray'], finish: ['matte'] }],
  [/^скандинав|^сканди|^минимал/, { label: 'скандинавский / минимализм', tones: ['light'], colors: ['white', 'lightgray', 'greige'], looks: ['plain'], finish: ['matte'] }],
  [/^классик|^классич|^роскош|^люксов|^дворцов|^премиальн|^барокко|^неоклассик|^art-?deco|^арт-?деко/, { label: 'классика / люкс', looks: ['marble'], colors: ['white', 'ivory', 'beige'], finish: ['gloss'] }],
  [/^японск|^вабисаби|^вабиса|^wabi|^дзен|^эко(стиль)?$|^органичн/, { label: 'японский / эко', tones: ['warm', 'muted'], looks: ['stone', 'concrete'], colors: ['greige', 'beige'], finish: ['matte'] }],
  [/^рустик|^шале|^кантри|^прованс|^деревенск/, { label: 'рустика', looks: ['wood', 'stone'], colors: ['brown', 'beige'], finish: ['structured'] }],
  [/^модерн|^соврем|^хай-?тек/, { label: 'современный', looks: ['plain', 'concrete'], colors: ['gray', 'white'] }],
  [/^средиземн|^италь|^тоскан/, { label: 'средиземноморский', tones: ['warm'], colors: ['beige', 'sand', 'red'], looks: ['stone'] }],
];
// Поверхность
const FINISH = {
  gloss:      { label: 'глянцевая', re: /^глянц|^блест|^зеркал|^полирован|^gloss|^люкс$|^lux$|^lapp?ato$|^лаппат|^отполирован|^глянец/, ofProduct: f => /люкс|полир|лаппат/.test(f) },
  matte:      { label: 'матовая', re: /^матов|^matt?e?$|^натурал(ьн)?ая? поверх|^натуральн(ая|ый|ое)? (отделк|поверх)|^неглянц|^шелков/, ofProduct: f => /натураль|матов|силк|шлиф/.test(f) },
  structured: { label: 'структурная, рельефная', re: /^структур|^рельеф|^шероховат|^нескольз|^противоскольз|^антислип|^antislip|^рифлен|^фактурн|^grip|^грип$|^брашир|^пескоструй|^грубая/, ofProduct: f => /структур/.test(f) },
  patina:     { label: 'патинированная', re: /^патин|^состарен|^винтаж|^aged|^античн/, ofProduct: f => /патин/.test(f) },
  silk:       { label: 'силк (шелковистая)', re: /^силк|^silk|^сатин|^шелковист/, ofProduct: f => /силк/.test(f) },
};
// Где будет лежать
const OUTDOOR = /^улиц|^терасс|^террас|^двор|^сад(у|а|ов)?$|^дач|^фасад|^бассейн|^патио|^веранд|^балкон|^крыльц|^площадк|^дорожк|^outdoor|^наружн|^уличн|^парковк|^тротуар|^ступен/;
const INDOOR_WORDS = /^ванн|^кухн|^гостин|^спальн|^прихож|^коридор|^пол$|^полы$|^стен|^фартук|^санузел|^туалет|^душев|^комнат|^офис|^магазин|^ресторан/;

// ------------------------------------------------------------------------------------------------ разбор запроса
const NUM = '(\\d[\\d\\s.,]*)';
function toNumber(raw, unitWord) {
  let v = Number(String(raw).replace(/\s+/g, '').replace(',', '.'));
  if (!Number.isFinite(v)) return null;
  if (/^(тыс|т\.?\s?р|k|к$)/i.test(unitWord || '')) v *= 1000;
  return v;
}
export function parseQuery(text) {
  const raw = String(text ?? '').slice(0, 300);
  let s = ё(raw).replace(/[«»"“”]/g, ' ').replace(/\s+/g, ' ').trim();
  const q = { raw, colors: new Map(), tones: new Set(), styleTones: new Set(), styleFinishes: new Set(), looks: new Map(), finishes: new Set(), notLooks: new Set(), notFinishes: new Set(), formats: [], formatClass: null,
    nameWords: [], detailColors: new Set(), priceMin: null, priceMax: null, cheap: false, premium: false, section: null, outdoor: false, category: null, code: null, words: [], styles: [], unknown: [], notes: [] };
  if (!s) return q;

  // артикул (12 цифр)
  const code = s.match(/\b(\d{12})\b/); if (code) { q.code = code[1]; s = s.replace(code[1], ' '); }

  // формат: 60x120, 60х120, 60×120, 60 на 120; «30х30» и «мозаика 30x30»
  s = s.replace(/(\d{2,3}(?:[.,]\d)?)\s*(?:x|х|×|\*|на)\s*(\d{2,3}(?:[.,]\d)?)/g, (m, a, b) => { q.formats.push(`${a.replace(',', '.')}X${b.replace(',', '.')}`); return ' '; });
  // цена. «от 3000 до 6000», «3000-6000», «до 5000 руб», «не дороже 5 тыс», «дешевле 4000», «бюджет 4500», «около 5000»
  const unit = '(?:\\s*(тыс(?:яч)?\\.?|т\\.?\\s?р\\.?|к)(?![а-я]))?';
  const priceRe = {
    range: new RegExp(`(?:от\\s*)?${NUM}${unit}\\s*(?:-|–|—|до|по)\\s*${NUM}${unit}\\s*(?:руб\\w*|р\\.?|₽|рублей)?`),
    max:   new RegExp(`(?:до|не\\s*дороже|дешевле|не\\s*более|не\\s*выше|максимум|бюджет|в\\s*пределах|менее)\\s*${NUM}${unit}\\s*(?:руб\\w*|р\\.?|₽|рублей)?`),
    min:   new RegExp(`(?:от|дороже|не\\s*дешевле|не\\s*менее|минимум|более|свыше)\\s*${NUM}${unit}\\s*(?:руб\\w*|р\\.?|₽|рублей)?`),
    around: new RegExp(`(?:около|порядка|примерно|~)\\s*${NUM}${unit}\\s*(?:руб\\w*|р\\.?|₽|рублей)?`),
    bare:  new RegExp(`${NUM}${unit}\\s*(?:руб\\w*|₽|рублей|р\\.?(?![а-я]))`),
  };
  let m;
  if ((m = s.match(priceRe.range))) { const a = toNumber(m[1], m[2] || m[4]), b = toNumber(m[3], m[4] || m[2]); if (a != null && b != null && b > 99) { q.priceMin = Math.min(a, b); q.priceMax = Math.max(a, b); s = s.replace(m[0], ' '); } }
  if (q.priceMax == null && (m = s.match(priceRe.max))) { const v = toNumber(m[1], m[2]); if (v != null) { q.priceMax = v; s = s.replace(m[0], ' '); } }
  if (q.priceMin == null && (m = s.match(priceRe.min))) { const v = toNumber(m[1], m[2]); if (v != null && v >= 100) { q.priceMin = v; s = s.replace(m[0], ' '); } }
  if (q.priceMin == null && q.priceMax == null && (m = s.match(priceRe.around))) { const v = toNumber(m[1], m[2]); if (v != null) { q.priceMin = v * 0.8; q.priceMax = v * 1.2; s = s.replace(m[0], ' '); } }
  if (q.priceMin == null && q.priceMax == null && (m = s.match(priceRe.bare))) { const v = toNumber(m[1], m[2]); if (v != null && v >= 100) { q.priceMax = v; s = s.replace(m[0], ' '); } }
  if (/недорог|бюджетн|дешев|эконом/.test(s) && q.priceMax == null) q.cheap = true;
  if (/премиум|дорог(ой|ая|ое|ие)\b|эксклюзив|элитн|статусн/.test(s) && q.priceMin == null) q.premium = true;

  // слова
  const tokens = s.split(/[^a-zа-я0-9-]+/).filter(Boolean);
  const negateNext = new Set(); let negate = false;
  const usedByLexicon = new Set();
  const addColor = (id, w = 1) => q.colors.set(id, Math.max(q.colors.get(id) || 0, w));
  const addLook = (id, w = 1) => q.looks.set(id, Math.max(q.looks.get(id) || 0, w));
  for (let i = 0; i < tokens.length; i++) {
    let t = tokens[i];
    const nextIsDetail = /^(прожил|вкраплен|инкруст|узор|рисун|разводы|блик|отлив)/.test(tokens[i + 1] || '');   // «золотые прожилки» — это не цвет плитки
    if (/^(без|не|нет|кроме)$/.test(t)) { negate = true; continue; }
    const parts = t.includes('-') ? t.split('-').filter(Boolean) : [t];
    let known = false;
    // составные: бело-серый, светло-серый, тёмно-коричневый, серо-бежевый
    if (parts.length >= 2) {
      for (const [re, id] of COMPOUND) if (re.test(parts[0])) { addColor(id, 0.9); const rest = parts.slice(1).join('-'); for (const [r2, ids] of COLOR_WORDS) if (r2.test(rest)) ids.forEach(c => addColor(c, 1)); known = true; usedByLexicon.add(i); }
      if (!known) { if (/^светл/.test(parts[0])) { q.tones.add('light'); const rest = parts.slice(1).join('-'); for (const [r2, ids] of COLOR_WORDS) if (r2.test(rest)) ids.forEach(c => addColor(c, 1)); known = true; } else if (/^темн/.test(parts[0])) { q.tones.add('dark'); const rest = parts.slice(1).join('-'); for (const [r2, ids] of COLOR_WORDS) if (r2.test(rest)) ids.forEach(c => addColor(c, 1)); known = true; } }
      if (known) { negate = false; continue; }
    }
    for (const part of parts) {
      let hit = false;
      for (const [re, ids] of COLOR_WORDS) if (re.test(part)) { ids.forEach(c => (negate ? q.notLooks.add('color:' + c) : nextIsDetail ? q.detailColors.add(c) : addColor(c, 1))); hit = true; }
      for (const [re, id] of TONES) if (re.test(part)) { if (!negate) q.tones.add(id); hit = true; }
      for (const [id, d] of Object.entries(LOOKS)) if (d.re.test(part)) { if (negate) q.notLooks.add(id); else addLook(id, 1); hit = true; if (part.length >= 6) q.nameWords.push(part); }
      for (const [id, d] of Object.entries(FINISH)) if (d.re.test(part)) { if (negate) q.notFinishes.add(id); else q.finishes.add(id); hit = true; }
      for (const [re, st] of STYLES) if (re.test(part)) { q.styles.push(st.label); (st.looks || []).forEach(l => addLook(l, 0.6)); (st.colors || []).forEach(c => addColor(c, 0.5)); (st.tones || []).forEach(x => q.styleTones.add(x)); (st.finish || []).forEach(f => q.styleFinishes.add(f)); hit = true; }
      if (OUTDOOR.test(part)) { q.outdoor = true; hit = true; }
      if (/^(недорог|бюджетн|дешев|эконом|дорог|премиум|эксклюзив|элитн|статусн|подешевл)/.test(part)) hit = true;
      if (INDOOR_WORDS.test(part)) hit = true;
      if (/^мозаик/.test(part)) { q.category = 'mosaic'; hit = true; }
      if (/^декор|^бордюр|^вставк|^фриз/.test(part)) { q.category = 'decor'; hit = true; }
      if (/^(больш|крупн|широкоформат|гигант|слэб|slab|макси|огромн)/.test(part)) { q.formatClass = 'large'; hit = true; }
      if (/^(маленьк|небольш|мелк|компактн|мини)/.test(part)) { q.formatClass = 'small'; hit = true; }
      if (/^квадрат/.test(part)) { q.formatClass = q.formatClass || 'square'; hit = true; }
      if (/^прямоугольн|^вытянут|^длинн/.test(part)) { q.formatClass = q.formatClass || 'rect'; hit = true; }
      if (/^(coliseum|колизей)/.test(part)) { q.section = 'coliseum'; hit = true; }
      if (/^(x2|х2)$|^икс2$/.test(part)) { q.section = 'x2'; hit = true; }
      if (/^контракт/.test(part)) { q.section = q.section || 'contract'; }
      if (hit) known = true;
    }
    negate = false;
    if (!known && t.length >= 3 && !/^(и|или|для|под|с|со|на|в|во|по|от|до|мне|нужн\w*|хочу|ищу|подобрать|подбери\w*|найди\w*|плитк\w*|керамогранит\w*|что-нибудь|что-то|чтобы|как|вроде|типа|цвет\w*|оттен\w*|тон|покажи\w*|пожалуйста|такой|такую|такие|вариант\w*|размер\w*|формат\w*|поверхност\w*|рисунк\w*|стиль|стил\w*|кв|м2|м²|руб\w*|тыс\w*|цен\w*|стоимост\w*)$/.test(t)) q.words.push(t);
  }
  if (q.outdoor && !q.section) q.section = 'x2';
  return q;
}

// ------------------------------------------------------------------------------------------------ описание плитки
const NAME_HINTS = {
  marble: /КАЛАКАТ|КАРРАР|СТАТУАРИО|ИМПЕРИАЛ|АРАБ|ЛАЗА|КАНОВА|МАРМО|МРАМОР|ПАНДА|ЭМПЕРАД|ОРОБ|БРЕККИ|ФЬЯММ|ЭЛЕГ|РОЯЛ|ЛАКШЕРИ|ПРЕМИУМ|ДАВИНЧ|ВИНЧИ|СИРО|КЛАССИК/i,
  wood: /ОАК|ВУД|ДЕРЕВО|ДУБ|ТИК\b|ОРЕХ|NL-ВУД/i,
  stone: /СТОУН|ЭВЕРСТОУН|СЛЕЙТ|АРДЕЗ|ДЕЗЕРТ|ДАСТ|МИНЕРАЛ|ФОССИЛ|ДОВЕР|ВОЛКАНО|ЛАВА|МАГМА|ПЬЕТР|МИЛЛЕНИУМ|ТИТАНИО/i,
  concrete: /ЛОФТ|ЭТЕРНУМ|ЦЕМЕНТ|БЕТОН|КОНТИНУУМ|КОСМОС|СЕРФЕЙС|ФОГ|КЛАУД|АСТРО|СКАЙЛАЙН/i,
  metal: /АЙРОН|КОРТЕН|КАРБОН|СТЕЛЛАРИС|МЕТАЛ/i,
  onyx: /ОНИКС/i,
  travertine: /ТРАВЕРТ|ВЭЙВ|ТАТАМИ/i,
};
export function attributesOf(product, feat) {
  const [L, a, b] = feat.mean, C = feat.chroma, h = feat.hue, t = feat.tex;
  const name = `${product.name || ''} ${product.collection || ''}`;
  const jointy = /МОЗАИКА|СТРИП|БРИК|ГЕКСАГОН|ПОЛИГОН|ЛАУНЖ|СПЕКТРУМ|ВСТАВКА|ДЕКОР|БОРДЮР|ФРИЗ/i.test(`${product.format || ''} ${product.name || ''}`) || product.category !== 'plate';   // швы между чипами дают ложные «прожилки»
  const veinRaw = clamp(Math.max(t.veins / 0.10, t.strong / 0.05)) * (jointy ? 0.25 : 1);
  const woodRaw = clamp((t.coherence - 0.45) / 0.35) * trap(h, 25, 40, 100, 120) * clamp((C - 6) / 8);
  const plainRaw = clamp(1 - Math.max(t.stdL / 3.2, t.grain / 0.9, t.veins / 0.02));
  const cloudRaw = clamp((t.cloud - 0.9) / 2.2) * clamp(1 - veinRaw * 0.8);
  const grainRaw = clamp((t.grain - 0.5) / 1.4);
  const hint = k => NAME_HINTS[k].test(name) ? 1 : 0;
  const decor = product.category === 'decor' ? 1 : 0;
  const looks = {
    marble: clamp(Math.max(veinRaw * (1 - woodRaw * 0.7), hint('marble') * 0.55 + veinRaw * 0.35)),
    wood: clamp(Math.max(woodRaw, hint('wood') * 0.6 + woodRaw * 0.4)),
    stone: clamp(Math.max(grainRaw * 0.9 + cloudRaw * 0.3, hint('stone') * 0.6 + grainRaw * 0.3 + cloudRaw * 0.2) * (1 - veinRaw * 0.5)),
    concrete: clamp(Math.max(cloudRaw * trap(C, -1, 0, 9, 16) * 0.9 + plainRaw * 0.2 * trap(C, -1, 0, 8, 14), hint('concrete') * 0.6 + cloudRaw * 0.3) * (1 - veinRaw * 0.9)),
    metal: clamp(hint('metal') * 0.7 + cloudRaw * 0.2),
    travertine: clamp(Math.max(woodRaw * trap(L, 60, 70, 96, 100) * trap(C, 5, 8, 22, 30), hint('travertine') * 0.7)),
    onyx: clamp(hint('onyx') * 0.9),
    terrazzo: clamp(grainRaw * clamp(t.edges * 3) * (1 - plainRaw)),
    plain: clamp(plainRaw * (1 - decor * 0.8)),
    textile: clamp(grainRaw * 0.5 * trap(C, -1, 0, 12, 20) * plainRaw * 0.8 + (/КОТТОН|ЛЕН|ТКАН/i.test(name) ? 0.8 : 0)),
    pattern: clamp(decor * 0.7 + clamp((feat.spread[1] + feat.spread[2] - 8) / 14) * 0.5 + clamp(t.strong * 8) * 0.2),
  };
  return { L, a, b, C, h, looks, colorSpread: feat.spread[1] + feat.spread[2], tex: t };
}

// ------------------------------------------------------------------------------------------------ подбор
const finishesOf = p => lower(p.finish || '');
const plateFormatArea = f => { const m = String(f || '').match(/^(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)$/); return m ? Number(m[1]) * Number(m[2]) : 0; };
const formatKey = f => String(f || '').toUpperCase().replace(/Х/g, 'X');

export function describeQuery(q) {
  const out = [];
  if (q.code) out.push(`артикул ${q.code}`);
  for (const [id, w] of q.colors) if (w >= 0.9) out.push(COLORS[id].label);
  for (const id of q.detailColors) out.push(`прожилки: ${COLORS[id].label}`);
  for (const t of q.tones) out.push({ light: 'светлый', dark: 'тёмный', warm: 'тёплый', cool: 'холодный', neutral: 'нейтральный', vivid: 'яркий', muted: 'приглушённый' }[t]);
  for (const [id, w] of q.looks) if (w >= 0.9) out.push(LOOKS[id].label);
  for (const f of q.finishes) out.push(FINISH[f].label + ' поверхность');
  for (const f of q.formats) out.push(`формат ${f.replace('X', '×')}`);
  if (q.formatClass) out.push({ large: 'крупный формат', small: 'небольшой формат', square: 'квадратная', rect: 'прямоугольная' }[q.formatClass]);
  if (q.category) out.push(q.category === 'mosaic' ? 'мозаика' : 'декор');
  if (q.priceMin != null && q.priceMax != null) out.push(`${fmtRub(q.priceMin)}–${fmtRub(q.priceMax)}`); else if (q.priceMax != null) out.push(`до ${fmtRub(q.priceMax)}`); else if (q.priceMin != null) out.push(`от ${fmtRub(q.priceMin)}`);
  if (q.cheap) out.push('недорого'); if (q.premium) out.push('премиум');
  if (q.outdoor) out.push('для улицы (X2, 20 мм)'); else if (q.section === 'x2') out.push('линия X2');
  if (q.section === 'coliseum') out.push('Coliseum'); if (q.section === 'contract') out.push('Контракт');
  for (const s of q.styles) out.push(`стиль: ${s}`);
  return out;
}
const fmtRub = v => `${Math.round(v).toLocaleString('ru-RU').replace(/ /g, ' ')} ₽`;

function colorScore(q, at) {
  let best = 0; const matched = [];
  for (const [id, w] of q.colors) { const fit = COLORS[id].fit({ L: at.L, C: at.C, h: at.h }); if (fit > 0.02) matched.push([id, fit]); best += fit * w; }
  const n = Math.max(1, [...q.colors.values()].reduce((x, y) => x + y, 0));
  return { score: best / n, matched };
}

// Подсчёт баллов по уже разобранному запросу q. Возвращает все позиции с флагом hardFail (не подходят по жёстким условиям: цена, формат, раздел, категория).
function rank(q, pool, attrsOf, ctx) {
  const scored = [];
  for (const p of pool) {
    if (q.code) { if (p.code === q.code) scored.push({ p, score: 1000, reasons: ['артикул совпал'], hardFail: false }); continue; }
    const at = attrsOf(p); if (!at) continue;
    const reasons = []; let score = 0, hardFail = false;

    // слова из названия / коллекции (в том числе латиницей)
    const hay = ё(`${p.name} ${p.collection} ${p.latin || ''} ${p.collectionId}`);
    let wordHits = 0;
    for (const w of ctx.words) { const stem = w.replace(/(ый|ий|ой|ая|ое|ые|ие|ого|ому|ым|ом|ов|а|я|у|ы|и|е|о)$/, ''); if (stem.length >= 3 && hay.includes(stem)) { wordHits++; reasons.push(`в названии: «${w}»`); } }
    score += wordHits * 8;

    // категория / раздел
    if (q.category) { if (p.category === q.category) score += 3; else hardFail = true; }
    else if (p.category !== 'plate') score -= 1.2;       // по умолчанию — плитка; мозаика и декор только по просьбе или если очень подходят
    if (q.section) { if (p.section === q.section) { score += 3; reasons.push(q.outdoor ? 'для улицы (X2, 20 мм)' : `линия ${q.section === 'x2' ? 'X2' : lower(q.section)}`); } else hardFail = true; }

    // цвет
    if (q.colors.size) {
      const { score: cs, matched } = colorScore(q, at);
      if (cs < 0.05) score -= 4; else { score += cs * 12; if (cs > 0.35) reasons.push(`цвет: ${matched.sort((a, b) => b[1] - a[1]).slice(0, 2).map(m => COLORS[m[0]].label).join(', ')}`); }
    }
    // тон
    for (const t of new Set([...q.tones, ...q.styleTones])) {
      const fit = t === 'light' ? trap(at.L, 55, 72, 100, 101) : t === 'dark' ? trap(at.L, -1, 0, 42, 60) : t === 'warm' ? trap(at.h, 20, 40, 105, 125) * clamp((at.C - 4) / 8)
        : t === 'cool' ? Math.max(trap(at.h, 140, 190, 330, 360), at.C < 5 && at.L > 40 ? 0.3 : 0) * clamp((at.C - 1) / 5 + 0.2)
        : t === 'neutral' ? trap(at.C, -1, 0, 7, 14) : t === 'vivid' ? clamp((at.C - 14) / 18) : clamp(1 - Math.abs(at.C - 10) / 12) * trap(at.L, 20, 35, 80, 95);
      score += fit * 4 - (fit < 0.1 ? 2 : 0);
      if (fit > 0.5) reasons.push({ light: 'светлый тон', dark: 'тёмный тон', warm: 'тёплый оттенок', cool: 'холодный оттенок', neutral: 'нейтральный', vivid: 'яркий', muted: 'приглушённый' }[t]);
    }
    // рисунок
    for (const [id, w] of q.looks) { const v = at.looks[id] || 0; score += v * 10 * w - (v < 0.12 ? 3 * w : 0); if (v > 0.35) reasons.push(`рисунок: ${LOOKS[id].label}`); }
    for (const id of q.notLooks) { if (id.startsWith('color:')) { const cid = id.slice(6); if (COLORS[cid].fit({ L: at.L, C: at.C, h: at.h }) > 0.3) score -= 8; } else score -= (at.looks[id] || 0) * 10; }
    // поверхность
    const fin = finishesOf(p);
    for (const f of new Set([...q.finishes, ...q.styleFinishes])) { const w = q.finishes.has(f) ? 1 : 0.5; if (FINISH[f].ofProduct(fin)) { score += 4 * w; reasons.push(`поверхность: ${FINISH[f].label}`); } else score -= 2.5 * w; }
    for (const f of q.notFinishes) if (FINISH[f].ofProduct(fin)) score -= 6;
    // формат
    const pf = formatKey(p.format);
    if (q.formats.length) { if (q.formats.some(f => f === pf || f.split('X').reverse().join('X') === pf)) { score += 6; reasons.push(`формат ${pf.replace('X', '×')}`); } else hardFail = true; }
    if (q.formatClass) {
      const ar = plateFormatArea(pf); const [w, h] = (pf.match(/[\d.]+/g) || []).map(Number);
      const okF = q.formatClass === 'large' ? ar >= 7200 : q.formatClass === 'small' ? ar > 0 && ar <= 1800 : q.formatClass === 'square' ? w && w === h : w && h && w !== h;
      if (okF) { score += 3; reasons.push({ large: 'крупный формат', small: 'небольшой формат', square: 'квадратный формат', rect: 'прямоугольный формат' }[q.formatClass]); } else score -= 2;
    }
    // цена
    const price = p.priceKopecks / 100;
    if (q.priceMax != null || q.priceMin != null) {
      if (!(p.priceKopecks > 0) || (q.priceMax != null && price > q.priceMax) || (q.priceMin != null && price < q.priceMin)) hardFail = true;
      else { score += 2; reasons.push(q.priceMax != null && q.priceMin == null ? `в бюджете до ${fmtRub(q.priceMax)}` : 'в вашем бюджете'); }
    }
    scored.push({ p, score, reasons: [...new Set(reasons)], hardFail });
  }
  return scored;
}

export function searchByText(text, products, attrsOf, { limit = 120 } = {}) {
  const q = parseQuery(text);
  const notes = [];
  if (!q.raw.trim()) return { query: q, understood: [], results: [], relaxed: null, notes, total: 0 };
  const pool = products.filter(p => p.category !== 'packaging');
  const sortedPrices = pool.filter(p => p.category === 'plate' && p.unit === 'м²' && p.priceKopecks > 0).map(p => p.priceKopecks / 100).sort((a, b) => a - b);
  const pct = x => sortedPrices.length ? sortedPrices[Math.floor(x * (sortedPrices.length - 1))] : 0;
  if (q.cheap) q.priceMax = pct(0.3);
  if (q.premium) q.priceMin = pct(0.75);
  const ctx = { words: [...q.words, ...q.nameWords].map(w => w.replace(/[^a-zа-я0-9]/g, '')).filter(w => w.length >= 3) };

  let scored = rank(q, pool, attrsOf, ctx), ok = scored.filter(r => !r.hardFail), relaxed = null;
  if (!ok.length && !q.code) {
    // жёстких условий не выполнить — ослабляем по очереди: цена → формат → линия/категория
    const steps = [['цену', t => { t.priceMin = null; t.priceMax = null; }], ['формат', t => { t.formats = []; }], ['линию', t => { t.section = null; t.outdoor = false; }], ['категорию', t => { t.category = null; }]];
    const t = { ...q, formats: [...q.formats] };
    for (const [label, relax] of steps) {
      relax(t); ok = rank(t, pool, attrsOf, ctx).filter(r => !r.hardFail);
      if (ok.length) { relaxed = label; break; }
    }
    if (relaxed) notes.push(`Точно под все условия позиций нет — показал без ограничения: ${relaxed}.`);
  }
  ok.sort((a, b) => b.score - a.score || (a.p.priceKopecks || 1e12) - (b.p.priceKopecks || 1e12));
  const soft = q.colors.size || q.looks.size || q.tones.size || q.styleTones.size || ctx.words.length || q.finishes.size || q.styleFinishes.size;
  const groups = new Map(), results = [];
  for (const r of ok) {
    if (soft && r.score < 0.5) continue;
    const key = `${r.p.collectionId}|${r.p.image?.src || r.p.code}`;
    const g = groups.get(key);
    if (g) { g.more.push(r.p); continue; }
    const entry = { ...r, more: [] }; groups.set(key, entry); results.push(entry);
    if (results.length >= limit) break;
  }
  const matchedWords = ctx.words.filter(w => results.some(r => r.reasons.some(x => x.includes(`«${w}»`))));
  const missing = q.words.filter(w => !matchedWords.includes(w.replace(/[^a-zа-я0-9]/g, '')));
  if (missing.length) notes.push(`Слова «${missing.slice(0, 4).join('», «')}» не удалось сопоставить с каталогом — подбор по остальным признакам.`);
  return { query: q, understood: describeQuery(q), results, relaxed, notes, total: results.length };
}
