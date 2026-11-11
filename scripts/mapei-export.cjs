// Ежедневная выгрузка прайса Mapei из кабинета поставщика (lk.bomondceramica.ru): вход → «Строительная химия» → «Выгрузить в XML».
//
//   LK_USER=… LK_PASS=… node scripts/mapei-export.cjs <файл.xml>
//
// Логин и пароль — только из переменных окружения (в GitHub Actions — секреты LK_USER и LK_PASS), в код и журнал не попадают.
// Файл проверяется: это YML-выгрузка, в ней не меньше 100 позиций Mapei — иначе ошибка, и сайт не обновляется битыми данными.
// Нужен Playwright: в CI ставится workflow-ом; локально — PLAYWRIGHT_PATH или `npm i --no-save playwright`.
const { readFileSync, writeFileSync } = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const BASE = 'https://lk.bomondceramica.ru';
const out = process.argv[2];
if (!out || !process.env.LK_USER || !process.env.LK_PASS) { console.error('Нужны LK_USER, LK_PASS и путь к файлу'); process.exit(2); }

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  try {
    const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
    await page.goto(BASE + '/', { waitUntil: 'load', timeout: 120000 });
    await page.fill('input[name=USER_LOGIN]', process.env.LK_USER);
    await page.fill('input[name=USER_PASSWORD]', process.env.LK_PASS);
    await page.locator('form[name=form_auth] [type=submit], form[name=form_auth] button').first().click();
    // вход отправляется скриптом страницы: ждём, пока форма входа пропадёт (неверный пароль — останется)
    await page.waitForSelector('input[name=USER_PASSWORD]', { state: 'detached', timeout: 30000 }).catch(() => {});
    await page.goto(BASE + '/lkcatalog/stroitelnaya_khimiya/', { waitUntil: 'load', timeout: 120000 });
    if (await page.locator('input[name=USER_PASSWORD]').count()) throw new Error('не удалось войти в кабинет — проверьте логин и пароль (секреты LK_USER, LK_PASS)');
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.locator('button.js-export[data-type=xml]').first().click()]);
    const xml = readFileSync(await download.path(), 'utf8');
    const offers = (xml.match(/<offer /g) || []).length, mapei = (xml.match(/<name>(MAPEI|МАПЕИ) /g) || []).length;
    if (!/^<\?xml[\s\S]*<yml_catalog/.test(xml) || mapei < 100) throw new Error(`выгрузка не похожа на прайс Mapei: позиций ${offers}, Mapei ${mapei}`);
    writeFileSync(out, xml);
    console.log(`выгрузка: ${offers} позиций, Mapei ${mapei} → ${out}`);
  } finally { await browser.close(); }
})().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
