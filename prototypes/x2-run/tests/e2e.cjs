// Проверки в браузере (Playwright + Chromium): управление, пауза, конец игры, экранные кнопки, размеры, освобождение ресурсов.
// Запуск: python3 -m http.server 4192 (в папке prototypes/x2-run), затем node tests/e2e.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const URL = process.env.X2_URL || 'http://127.0.0.1:4192/index.html?test=1';
const exe = process.env.CHROMIUM || (require('fs').existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

let failed = 0;
async function check(name, fn) { try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('ПРОВАЛ:', name, '\n ', e.message.split('\n').slice(0, 4).join('\n  ')); } }

(async () => {
  const browser = await chromium.launch({ executablePath: exe });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => m.type() === 'error' && errors.push(m.text())); page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL); await page.waitForFunction('window.__X2__');
  const g = (fn, arg) => page.evaluate(fn, arg);
  const vis = sel => page.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && e.getClientRects().length > 0; }, sel);

  await check('меню показано, игра не идёт', async () => {
    assert.equal(await g(() => window.__X2__.game.phase), 'menu'); assert.ok(await vis('[data-menu]')); assert.ok(!(await vis('[data-hud]')));
    const t0 = await g(() => window.__X2__.game.time); await page.waitForTimeout(300); assert.equal(await g(() => window.__X2__.game.time), t0);
  });

  await check('холст не пустой: на нём есть небо, земля и робот', async () => {
    const px = await g(() => { const c = document.querySelector('[data-view]'), x = c.getContext('2d'); const get = (fx, fy) => [...x.getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data]; return [get(0.5, 0.05), get(0.9, 0.9), get(0.1, 0.7), get(0.7, 0.3)]; });
    assert.ok(new Set(px.map(p => p.join(','))).size >= 3, JSON.stringify(px));
  });

  await check('«Начать забег»: появляется HUD, меню скрыто', async () => {
    await page.click('[data-act="start"]'); assert.equal(await g(() => window.__X2__.game.phase), 'running'); assert.ok(await vis('[data-hud]')); assert.ok(!(await vis('[data-menu]')));
  });

  await check('стрелка вправо: робот бежит, камера едет вперёд', async () => {
    const x0 = await g(() => window.__X2__.game.player.x);
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(700);
    const x1 = await g(() => window.__X2__.game.player.x); const cam = await g(() => window.__X2__.game.cam.x);
    await page.keyboard.up('ArrowRight'); assert.ok(x1 - x0 > 120, `${x0} → ${x1}`); assert.ok(cam >= 0);
  });

  await check('пробел: прыжок, высота около 170 px, потом приземление', async () => {
    await g(() => { const a = window.__X2__; a.game.enemies.length = 0; a.game.player.invuln = 999; });
    await page.waitForTimeout(400);
    await page.keyboard.down('Space'); await page.waitForTimeout(240); const y = await g(() => window.__X2__.game.player.y); await page.keyboard.up('Space');
    assert.ok(y < -60, `y=${y}`); await page.waitForTimeout(900); assert.equal(await g(() => window.__X2__.game.player.onGround), true);
  });

  await check('X: выстрел плитой, ↑ + X: стрельба вверх', async () => {
    await g(() => { const gm = window.__X2__.game; gm.enemies.length = 0; gm.bullets.length = 0; gm.player.cooldown = 0; });
    const s0 = await g(() => window.__X2__.game.shots);
    await page.keyboard.down('KeyX'); await page.waitForTimeout(350); await page.keyboard.up('KeyX');
    assert.ok((await g(() => window.__X2__.game.shots)) - s0 >= 2);
    await g(() => { const gm = window.__X2__.game; gm.bullets.length = 0; gm.player.cooldown = 0; });
    await page.keyboard.down('ArrowUp'); await page.keyboard.down('KeyX'); await page.waitForTimeout(120);
    const vy = await g(() => { const b = window.__X2__.game.bullets[0]; return b ? b.vy : 0; });
    await page.keyboard.up('KeyX'); await page.keyboard.up('ArrowUp'); assert.ok(vy < -500, `vy=${vy}`);
  });

  await check('пауза: Esc, кнопка и «Продолжить»; в паузе время стоит', async () => {
    await page.keyboard.press('Escape'); assert.equal(await g(() => window.__X2__.game.phase), 'paused'); assert.ok(await vis('[data-pause]'));
    const t0 = await g(() => window.__X2__.game.time); await page.waitForTimeout(300); assert.equal(await g(() => window.__X2__.game.time), t0);
    await page.click('[data-act="resume"]'); assert.equal(await g(() => window.__X2__.game.phase), 'running');
    await page.click('.x2r-hud [data-act="pause"]'); assert.equal(await g(() => window.__X2__.game.phase), 'paused');
    await page.keyboard.press('Escape'); assert.equal(await g(() => window.__X2__.game.phase), 'running');
  });

  await check('скрытая вкладка ставит игру на паузу', async () => {
    await g(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await g(() => window.__X2__.game.phase), 'paused');
    await g(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await g(() => window.__X2__.game.phase), 'paused', 'продолжение только по действию игрока');
    await page.click('[data-act="resume"]');
  });

  await check('клавиши игры не мешают вводу текста на странице', async () => {
    await g(() => { const i = document.createElement('input'); i.id = 'tmp'; i.style.cssText = 'position:fixed;left:0;top:0;z-index:99'; document.body.appendChild(i); i.focus(); });
    const x0 = await g(() => window.__X2__.game.player.x);
    await page.keyboard.type('dddd'); const v = await g(() => document.getElementById('tmp').value);
    assert.equal(v, 'dddd'); await g(() => document.getElementById('tmp').remove());
    assert.ok((await g(() => window.__X2__.game.input.right)) === false);
  });

  await check('экранные кнопки: огонь и бег работают, включаются галочкой', async () => {
    await g(() => { const u = window.__X2__.ui; u.el.touchToggle.checked = true; u.el.touchToggle.dispatchEvent(new Event('change')); });
    assert.ok(await vis('[data-touch]'));
    await g(() => { window.__X2__.game.enemies.length = 0; window.__X2__.game.player.cooldown = 0; });
    const s0 = await g(() => window.__X2__.game.shots);
    const f = await page.$('.x2r-touch [data-key="fire"]'); const bb = await f.boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(400); await page.mouse.up();
    assert.ok((await g(() => window.__X2__.game.shots)) - s0 >= 2);
    const r = await page.$('.x2r-touch [data-key="right"]'); const rb = await r.boundingBox(); const x0 = await g(() => window.__X2__.game.player.x);
    await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2); await page.mouse.down(); await page.waitForTimeout(500); await page.mouse.up();
    assert.ok((await g(() => window.__X2__.game.player.x)) - x0 > 60);
    assert.equal(await g(() => window.__X2__.game.input.right), false);
  });

  await check('подбор оружия и сердца меняет HUD', async () => {
    await g(() => { const a = window.__X2__, gm = a.game; gm.player.hearts = 2; gm.items.push(gm.makeItem('fan', gm.player.x, gm.player.y - 10)); gm.items.push(gm.makeItem('heart', gm.player.x, gm.player.y - 10)); a.advance(0.1); });
    assert.equal(await g(() => document.querySelector('[data-weapon]').textContent), 'ВЕЕР');
    assert.equal(await g(() => window.__X2__.game.player.hearts), 3);
  });

  await check('конец игры: итоги и «Ещё раз» сбрасывают мир', async () => {
    await g(() => { const a = window.__X2__, gm = a.game; gm.player.invuln = 0; gm.player.shield = 0; for (let i = 0; i < 9; i++) { gm.player.invuln = 0; gm.hurtPlayer(0); } });
    assert.equal(await g(() => window.__X2__.game.phase), 'over'); assert.ok(await vis('[data-end]'));
    assert.match(await g(() => document.querySelector('[data-endarea]').textContent), /УЛОЖЕНО/);
    await page.click('[data-end] [data-act="again"]');
    assert.equal(await g(() => window.__X2__.game.phase), 'running'); assert.equal(await g(() => window.__X2__.game.area), 0); assert.ok(!(await vis('[data-end]')));
  });

  await check('победа: экран «Забег пройден»', async () => {
    await g(() => { const gm = window.__X2__.game; gm.finish(true); });
    assert.equal(await g(() => document.querySelector('[data-endtitle]').textContent), 'Забег пройден!');
    await page.click('[data-end] [data-act="menu"]'); assert.equal(await g(() => window.__X2__.game.phase), 'menu');
  });

  await check('изменение размера окна: холст перестраивается, ошибок нет', async () => {
    for (const [w, h] of [[844, 390], [390, 844], [1700, 700], [1280, 720]]) {
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(200);
      const r = await g(() => { const c = document.querySelector('[data-view]'), a = window.__X2__; a.advance(0.05); return { cw: c.clientWidth, w: c.width, W: a.renderer.W, H: a.renderer.H }; });
      assert.ok(r.w >= r.cw * 0.9, JSON.stringify(r)); assert.ok(r.W >= 720 && r.H >= 720 - 1, JSON.stringify(r));
    }
  });

  await check('оба режима качества рисуют без ошибок', async () => {
    for (const q of ['low', 'high', 'low']) {
      const r = await g((q) => { const a = window.__X2__, gm = a.game; a.setQuality(q); gm.start(); gm.player.invuln = 9999; gm.input.right = true; gm.input.fire = true; a.advance(4); return { q: a.renderer.quality, x: gm.player.x, laid: a.renderer.shownLaidX }; }, q);
      assert.equal(r.q, q); assert.ok(r.x > 600 && r.laid > 300, JSON.stringify(r));
    }
  });

  await check('выход: ресурсы освобождены, холст и интерфейс убраны', async () => {
    await g(() => window.__X2__.destroy());
    assert.equal(await g(() => document.getElementById('game').children.length), 0);
    assert.equal(await g(() => document.getElementById('game').classList.contains('x2r')), false);
  });

  await check('консоль без ошибок', async () => { const real = errors.filter(e => !/404/.test(e)); assert.equal(real.length, 0, real.join('\n')); });

  await browser.close();
  console.log(failed ? `\nПровалено проверок: ${failed}` : '\nВсё: все проверки пройдены');
  process.exit(failed ? 1 : 0);
})();
