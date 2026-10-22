// Сквозная проверка в настоящем браузере (Chromium, WebGL через SwiftShader).
// Запуск: сервер статики на :4190 (python3 -m http.server 4190), затем node tests/e2e.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const assert = require('node:assert/strict');
const URL = process.env.X2_URL || 'http://127.0.0.1:4190/index.html?test=1';
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
let passed = 0;
const ok = (name) => { passed++; console.log('ok  ', name); };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ARGS });
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  const g = (fn, arg) => page.evaluate(fn, arg);
  const game = () => g(() => { const x = window.__X2__.game; return { phase: x.phase, lane: x.lane, y: x.y, z: x.z, time: x.time, area: x.area, lives: x.lives, wide: x.wide, zone: x.zone, tiles: x.tilesLaid, pickups: x.pickupsTaken }; });
  const vis = sel => page.isVisible(sel);

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('[data-act="start"]', { state: 'visible' });
  assert.equal((await game()).phase, 'menu'); assert.ok(await vis('[data-menu]')); assert.ok(!(await vis('[data-hud]')));
  assert.equal(await g(() => window.__X2__.game.z), 0, 'мир не движется до старта');
  ok('меню показано, до старта ничего не движется');

  // --- старт ---
  await page.click('[data-act="start"]');
  assert.equal((await game()).phase, 'running'); assert.ok(await vis('[data-hud]')); assert.ok(!(await vis('[data-menu]')));
  ok('кнопка «Начать забег» запускает забег и показывает HUD');

  // --- клавиатура ---
  await page.keyboard.press('ArrowLeft'); assert.equal((await game()).lane, 0);
  await page.keyboard.press('ArrowLeft'); assert.equal((await game()).lane, 0, 'за левую границу не выходит');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); assert.equal((await game()).lane, 2);
  await page.keyboard.press('KeyA'); assert.equal((await game()).lane, 1);
  await g(() => window.__X2__.advance(0.5));
  await page.keyboard.press('Space'); await g(() => window.__X2__.advance(0.12));
  assert.ok((await game()).y > 0.3, 'прыжок поднимает робота');
  await g(() => window.__X2__.advance(1.0)); assert.equal((await game()).y, 0, 'приземляется');
  ok('стрелки/A, пробел: смена полосы и прыжок');

  // --- свайпы ---
  const cv = await page.$eval('[data-view]', el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const swipe = async (dx, dy) => { await page.mouse.move(cv.x, cv.y); await page.mouse.down(); await page.mouse.move(cv.x + dx / 2, cv.y + dy / 2); await page.mouse.move(cv.x + dx, cv.y + dy); await page.mouse.up(); };
  await swipe(-120, 0); assert.equal((await game()).lane, 0);
  await swipe(120, 0); assert.equal((await game()).lane, 1);
  await swipe(0, -120); await g(() => window.__X2__.advance(0.1)); assert.ok((await game()).y > 0.3);
  await g(() => window.__X2__.advance(1.0));
  ok('свайпы: влево, вправо, вверх (прыжок)');

  // --- экранные кнопки ---
  await g(() => window.__X2__.ui.setTouch(true));
  await page.dispatchEvent('[data-act="left"]', 'pointerdown'); assert.equal((await game()).lane, 0);
  await page.dispatchEvent('[data-act="right"]', 'pointerdown'); assert.equal((await game()).lane, 1);
  await page.dispatchEvent('[data-act="jump"]', 'pointerdown'); await g(() => window.__X2__.advance(0.1)); assert.ok((await game()).y > 0.3);
  await g(() => window.__X2__.advance(1.0)); await g(() => window.__X2__.ui.setTouch(false));
  ok('экранные кнопки');

  // --- пауза ---
  let before = await game();
  await page.keyboard.press('Escape');
  assert.equal((await game()).phase, 'paused'); assert.ok(await vis('[data-pause]'));
  await page.waitForTimeout(600);
  const frozen = await game(); await page.waitForTimeout(500); assert.equal((await game()).z, frozen.z, 'в паузе мир стоит');
  await page.click('[data-act="resume"]'); assert.equal((await game()).phase, 'running'); assert.ok(!(await vis('[data-pause]')));
  await page.click('[data-act="pause"]'); assert.equal((await game()).phase, 'paused');
  await page.keyboard.press('Escape'); assert.equal((await game()).phase, 'running');
  ok('пауза: Escape, кнопка, «Продолжить»; в паузе всё стоит');

  // --- переход на другую вкладку: пауза, возобновление только по действию ---
  await g(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal((await game()).phase, 'paused');
  await g(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(400); assert.equal((await game()).phase, 'paused', 'сам не продолжается');
  await page.click('[data-act="resume"]');
  ok('скрытая вкладка ставит игру на паузу, продолжение только по действию игрока');

  // --- замена плитки: плиты долетают и появляются на сцене ---
  await g(() => { const a = window.__X2__; a.game.start(); a.game.track.obstacles.length = 0; a.game.track.pickups.length = 0; a.advance(4); });
  const s1 = await g(() => { const a = window.__X2__; a.advance(0.6); return { laid: a.game.tilesLaid, placed: a.stage.world.placed, area: a.game.area }; });
  assert.ok(s1.laid >= 40, 'плитки укладываются'); assert.ok(s1.placed >= s1.laid - 8 && s1.placed <= s1.laid, `на сцене ${s1.placed} из ${s1.laid}`);
  assert.ok(Math.abs(s1.area - s1.laid * 0.36) < 1e-6);
  ok('замена плитки: плиты долетают до земли, счёт 0,36 м² за плитку');

  // --- коробка X2: широкая укладка ---
  const w = await g(() => { const a = window.__X2__, x = a.game; x.start(); x.track.obstacles.length = 0; const p = x.track.pickups[0]; x.moveLane(p.lane - 1); x.z = p.z + 2; a.advance(0.6); return { wide: x.wide, pickups: x.pickupsTaken, shown: document.querySelector('[data-wide]').hidden === false }; });
  assert.equal(w.pickups, 1); assert.ok(w.wide > 3); assert.ok(w.shown, 'плашка «Широкая укладка» показана');
  const rows = await g(() => { const a = window.__X2__; a.advance(2.5); const x = a.game; let full = 0; for (let r = 0; r < 100; r++) { let n = 0; for (let c = 0; c < 6; c++) n += x.laid[r * 6 + c]; if (n === 6) full++; } return full; });
  assert.ok(rows >= 10, 'ряды из шести плиток'); 
  ok('сбор коробки X2: широкая укладка на все три полосы');

  // --- столкновение ---
  const h = await g(() => { const a = window.__X2__, x = a.game; x.start(); x.track.pickups.length = 0; x.track.obstacles.length = 0; x.track.obstacles.push({ id: 0, type: 'planter', lane: 1, x: 0, z: -6, h: 1.9, jumpable: false, w: 1.5, hit: false }); a.advance(1.6); return { lives: x.lives, off: document.querySelectorAll('[data-lives] i.off').length, inv: x.invuln }; });
  assert.equal(h.lives, 2); assert.equal(h.off, 1); assert.ok(h.inv > 0);
  ok('столкновение: минус попытка, индикатор, защита от повторного урона');

  // --- завершение по времени и перезапуск ---
  await g(() => { const a = window.__X2__, x = a.game; x.start(); x.track.obstacles.length = 0; x.track.pickups.length = 0; a.advance(61); });
  assert.equal((await game()).phase, 'ended'); assert.ok(await vis('[data-end]'));
  const endText = await page.textContent('[data-end]'); assert.match(endText, /Уложено/); assert.match(endText, /4 из 4/); assert.match(endText, /Ещё раз/);
  await page.click('[data-act="again"]');
  const r = await game(); assert.equal(r.phase, 'running'); assert.ok(r.time < 0.6, 'таймер начался заново'); assert.ok(r.area < 3, 'счёт начался заново'); assert.equal(r.lives, 3);
  const fresh = await g(() => { const a = window.__X2__; a.advance(0.1); return { placed: a.stage.world.placed, laid: a.game.tilesLaid }; });
  assert.ok(fresh.placed <= fresh.laid + 2, 'после перезапуска сцена очищена от прошлого забега');
  ok('конец забега, экран результата, «Ещё раз» сбрасывает мир и счёт');

  // --- три столкновения ---
  const lose = await g(() => { const a = window.__X2__, x = a.game; x.start(); x.track.pickups.length = 0; x.track.obstacles.length = 0;
    [-6, -24, -44].forEach((z, i) => x.track.obstacles.push({ id: i, type: 'planter', lane: 1, x: 0, z, h: 1.9, jumpable: false, w: 1.5, hit: false })); a.advance(9); return { phase: x.phase, lives: x.lives, reason: x.endReason }; });
  assert.equal(lose.phase, 'ended'); assert.equal(lose.reason, 'lives'); assert.equal(lose.lives, 0);
  assert.match(await page.textContent('[data-end]'), /Попытки закончились/);
  ok('три столкновения завершают забег');

  // --- качество ---
  await page.click('[data-end] [data-act="menu"]'); assert.ok(await vis('[data-menu]'));
  await page.selectOption('[data-quality]', 'low');
  assert.equal(await g(() => window.__X2__.stage.qualityName), 'low');
  assert.equal(await g(() => window.__X2__.stage.renderer.shadowMap.enabled), false);
  await page.click('[data-act="start"]'); await g(() => window.__X2__.advance(1)); assert.equal((await game()).phase, 'running');
  await page.click('[data-act="pause"]'); await page.click('[data-pause] [data-act="menu"]');
  await page.selectOption('[data-quality]', 'high'); assert.equal(await g(() => window.__X2__.stage.renderer.shadowMap.enabled), true);
  ok('режим сниженного качества (без теней) включается и работает; возврат к высокому');

  // --- освобождение ресурсов ---
  const mem = await g(() => { const a = window.__X2__; const before = { ...a.stage.renderer.info.memory }; const r = a.stage.renderer; a.destroy(); return { before, after: { ...r.info.memory }, loop: 'destroyed' }; });
  assert.ok(mem.before.geometries > 10 && mem.before.textures > 3);
  assert.ok(mem.after.geometries <= 1, 'геометрии освобождены (одна остаётся — служебная плоскость фона внутри Three.js)'); assert.equal(mem.after.textures, 0, 'текстуры освобождены');
  ok(`выход: ресурсы освобождены (было ${mem.before.geometries} геометрий, ${mem.before.textures} текстур)`);

  // --- без WebGL ---
  const p2 = await ctx.newPage();
  await p2.addInitScript(() => { const orig = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : orig.call(this, t, ...a); }; });
  await p2.goto(URL, { waitUntil: 'load' }); await p2.waitForTimeout(400);
  assert.ok(await p2.isVisible('[data-nogl]')); assert.match(await p2.textContent('[data-nogl]'), /WebGL/);
  ok('без WebGL — понятное сообщение');

  assert.deepEqual(errors, [], 'ошибок в консоли нет');
  ok('консоль без ошибок');
  console.log(`\nВсё: ${passed} проверок пройдено`);
  await browser.close();
})().catch(e => { console.error('ПРОВАЛ:', e.message); process.exit(1); });
