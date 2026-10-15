// Интерфейс поверх canvas: HUD, меню, пауза, итоги, экранные кнопки. Только читает состояние игры.
import { CONFIG } from './config.js';
import { CSS } from './styles.js';

const BOSS_NAMES = ['АСФАЛЬТОУКЛАДЧИК', 'БЕТОНОМЕШАЛКА', 'ДОРОЖНЫЙ КАТОК', 'ЭКСКАВАТОР'];
const fmt = (v, d = 1) => v.toFixed(d).replace('.', ',');
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function mountMarkup(root) {
  if (!document.getElementById('x2r-style')) { const st = document.createElement('style'); st.id = 'x2r-style'; st.textContent = CSS; document.head.appendChild(st); }
  root.classList.add('x2r');
  const hearts = CONFIG.player.maxHearts;
  root.innerHTML = `
<canvas data-view tabindex="0" aria-label="Игра X2 / ГОРОД"></canvas>
<div class="x2r-hud" data-hud hidden>
  <div class="x2r-top">
    <div class="x2r-pill x2r-brand"><span><b>X2</b> / ГОРОД</span><small data-zone>ПАРКОВКА</small></div>
    <div class="x2r-pill x2r-score">УЛОЖЕНО<b data-area>0,0</b>м²</div>
    <div class="x2r-right">
      <div class="x2r-pill x2r-hearts" data-hearts aria-label="Попытки">${'<i>♥</i>'.repeat(hearts)}</div>
      <div class="x2r-pill x2r-weapon">ОРУЖИЕ<b data-weapon>ПЛИТА</b></div>
      <button class="x2r-pill x2r-btnicon" data-act="sound" aria-label="Звук" title="Звук">🔊</button>
      <button class="x2r-pill x2r-btnicon" data-act="pause" aria-label="Пауза" title="Пауза (Esc)">❚❚</button>
    </div>
  </div>
  <div class="x2r-boss x2r-pill" data-boss hidden><span data-bossname>БОСС</span><i><b data-bossfill></b></i></div>
  <div class="x2r-toast x2r-pill" data-toast></div>
  <div class="x2r-pill x2r-rail" data-rail><div class="bar"><div class="fill" data-fill></div>${CONFIG.zones.map((z, i) => `<span class="dot" data-dot="${i}" style="left:${(i + 0.5) / CONFIG.zones.length * 100}%"></span>`).join('')}</div><ol>${CONFIG.zones.map((z, i) => `<li data-zn="${i}">${z.name}</li>`).join('')}</ol></div>
</div>
<div class="x2r-touch" data-touch hidden>
  <button class="l" data-key="left" aria-label="Влево">◀</button><button class="r" data-key="right" aria-label="Вправо">▶</button>
  <button class="u" data-key="up" aria-label="Вверх (прицел)">▲</button><button class="d" data-key="down" aria-label="Вниз"></button>
  <button class="j" data-key="jump" aria-label="Прыжок">ПРЫЖОК</button><button class="f" data-key="fire" aria-label="Огонь">ОГОНЬ</button>
</div>
<section class="x2r-overlay menu" data-menu><div class="x2r-card">
  <h1><b>X2</b> / ГОРОД</h1>
  <p>Робот X2 бежит по кварталу с коробкой плит, стреляет плитами по «браку» — треснувшему покрытию и ржавой технике — и укладывает за собой новую плитку. Четыре зоны, четыре босса.</p>
  <dl class="x2r-keys">
    <dt>Компьютер</dt><dd><kbd>←</kbd><kbd>→</kbd> бежать · <kbd>↑</kbd> стрелять вверх · <kbd>↓</kbd> пригнуться<br><kbd>Пробел</kbd> или <kbd>Z</kbd> прыжок · <kbd>X</kbd> или <kbd>Shift</kbd> огонь (держите — очередь) · <kbd>Esc</kbd> пауза</dd>
    <dt>Телефон</dt><dd>кнопки на экране: ◀ ▶ — бег, ▲ — прицел вверх, ПРЫЖОК и ОГОНЬ</dd>
    <dt>Бонусы</dt><dd>стреляйте по дронам с коробками: Веер, Скорострел, Тяжёлая плита, Щит, Сердце. ↓ + прыжок — спрыгнуть с уступа</dd>
  </dl>
  <div class="x2r-row"><button class="x2r-btn" data-act="start">Начать забег</button></div>
  <div class="x2r-opts"><label><input type="checkbox" data-touch-toggle> Экранные кнопки</label><label><input type="checkbox" data-sound-toggle checked> Звук</label><span data-best></span></div>
</div></section>
<section class="x2r-overlay" data-pause hidden><div class="x2r-card"><h2>Пауза</h2><p>Игра остановлена.</p><div class="x2r-row"><button class="x2r-btn" data-act="resume">Продолжить</button><button class="x2r-btn ghost" data-act="menu">В меню</button></div></div></section>
<section class="x2r-overlay" data-end hidden><div class="x2r-card"><h2 data-endtitle>Забег окончен</h2><p data-endtext></p><div class="x2r-big" data-endarea></div>
  <div class="x2r-stats"><span>Пройдено зон</span><b data-endzones></b><span>Брака заменено</span><b data-enddef></b><span>Коробок собрано</span><b data-endbox></b><span>Время</span><b data-endtime></b><span data-bestlabel>Рекорд</span><b data-endbest></b></div>
  <div class="x2r-row"><button class="x2r-btn" data-act="again">Ещё раз</button><button class="x2r-btn ghost" data-act="menu">В меню</button></div></div></section>
<div class="x2r-pill x2r-rot" data-rot hidden>Поверните телефон горизонтально — так играть удобнее</div>`;
}

export class UI {
  constructor(root, game, sfx) {
    this.root = root; this.game = game; this.sfx = sfx;
    const q = s => root.querySelector(s);
    this.el = { hud: q('[data-hud]'), menu: q('[data-menu]'), pause: q('[data-pause]'), end: q('[data-end]'), area: q('[data-area]'), zone: q('[data-zone]'), hearts: q('[data-hearts]'), weapon: q('[data-weapon]'), boss: q('[data-boss]'), bossName: q('[data-bossname]'), bossFill: q('[data-bossfill]'), toast: q('[data-toast]'), touch: q('[data-touch]'), touchToggle: q('[data-touch-toggle]'), soundToggle: q('[data-sound-toggle]'), soundBtn: q('[data-act="sound"]'), fill: q('[data-fill]'), best: q('[data-best]'), rot: q('[data-rot]') };
    this.last = {}; this.toastTimer = 0;
    this.best = 0; try { this.best = +localStorage.getItem('x2r:best') || 0; } catch { /* ignore */ }
    const coarse = matchMedia?.('(pointer: coarse)').matches; this.setTouch(!!coarse); this.el.touchToggle.checked = !!coarse;
    this.syncSound();
    this.off = game.on(e => this.onEvent(e));
    this.showPhase();
  }
  setTouch(on) { this.touch = on; this.el.touch.hidden = !on || this.game.phase === 'menu'; }
  syncSound() { const m = this.sfx.muted; this.el.soundBtn.textContent = m ? '🔇' : '🔊'; this.el.soundToggle.checked = !m; }
  toast(html, sub = '', ms = 1800) {
    const t = this.el.toast; t.innerHTML = html + (sub ? `<small>${sub}</small>` : ''); t.classList.add('on');
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => t.classList.remove('on'), ms);
  }
  onEvent(e) {
    const g = this.game;
    if (e.type === 'zone' && e.zone >= 0) this.toast(`ЗОНА ${e.zone + 1} · <b>${CONFIG.zones[e.zone].name}</b>`, CONFIG.zones[e.zone].tagline.toUpperCase());
    else if (e.type === 'bossStart') this.toast(`БОСС · <b>${BOSS_NAMES[e.zone]}</b>`, 'СТАРОЕ ПОКРЫТИЕ НЕ СДАЁТСЯ', 2400);
    else if (e.type === 'bossDefeated') this.toast('ЗОНА <b>ПРОЙДЕНА</b>', 'ПЛИТКА X2 УЛОЖЕНА', 2200);
    else if (e.type === 'start' || e.type === 'pause' || e.type === 'resume' || e.type === 'win' || e.type === 'over') this.showPhase();
    if (e.type === 'win' || e.type === 'over') this.fillEnd(e);
  }
  showPhase() {
    const p = this.game.phase, el = this.el;
    el.menu.hidden = p !== 'menu'; el.hud.hidden = p === 'menu'; el.pause.hidden = p !== 'paused'; el.end.hidden = !(p === 'over' || p === 'won');
    el.touch.hidden = !this.touch || p === 'menu';
    if (p === 'menu') el.best.textContent = this.best ? `Рекорд: ${fmt(this.best)} м²` : '';
    if (p === 'menu') this.root.querySelector('[data-act="start"]')?.focus?.({ preventScroll: true });
  }
  fillEnd(e) {
    const el = this.root, s = this.game.summary();
    const newBest = s.area > this.best;
    if (newBest) { this.best = s.area; try { localStorage.setItem('x2r:best', String(s.area)); } catch { /* ignore */ } }
    const set = (sel, v) => { el.querySelector(sel).textContent = v; };
    set('[data-endtitle]', s.won ? 'Забег пройден!' : 'Забег окончен');
    set('[data-endtext]', s.won ? 'Квартал выложен плиткой X2: парковка, подъезд, тротуар и территория у бассейна.' : 'Старое покрытие пока держится. Попробуйте ещё раз.');
    set('[data-endarea]', `УЛОЖЕНО ${fmt(s.area)} м²`);
    set('[data-endzones]', `${this.game.bossesDefeated} из ${CONFIG.zones.length}`);
    set('[data-enddef]', String(s.defects)); set('[data-endbox]', String(s.boxes)); set('[data-endtime]', mmss(s.time));
    set('[data-bestlabel]', newBest ? 'Новый рекорд!' : 'Рекорд'); set('[data-endbest]', `${fmt(this.best)} м²`);
    el.querySelector('[data-act="again"]')?.focus?.({ preventScroll: true });
  }
  /** Вызывается каждый кадр: обновляет только изменившиеся значения. */
  tick() {
    const g = this.game, p = g.player, el = this.el, L = this.last;
    if (g.phase === 'menu') return;
    const area = fmt(g.area); if (area !== L.area) { L.area = area; el.area.textContent = area; }
    if (g.zone !== L.zone) { L.zone = g.zone; el.zone.textContent = CONFIG.zones[g.zone].name; this.root.querySelectorAll('[data-zn]').forEach(li => li.classList.toggle('on', +li.dataset.zn === g.zone)); }
    if (p.hearts !== L.hearts) { L.hearts = p.hearts; el.hearts.querySelectorAll('i').forEach((h, i) => { h.style.display = i < Math.max(CONFIG.player.hearts, p.hearts) ? '' : 'none'; h.classList.toggle('off', i >= p.hearts); }); }
    const w = p.shield > 0 ? 'ЩИТ' : CONFIG.weapons[p.weapon].name.toUpperCase(); if (w !== L.weapon) { L.weapon = w; el.weapon.textContent = w; }
    const b = g.boss; const showBoss = !!b && b.state !== 'enter';
    if (showBoss !== L.showBoss) { L.showBoss = showBoss; el.boss.hidden = !showBoss; if (showBoss) el.bossName.textContent = BOSS_NAMES[b.kind]; }
    if (showBoss) { const pct = Math.max(0, b.hp / b.maxHp * 100).toFixed(0); if (pct !== L.pct) { L.pct = pct; el.bossFill.style.width = pct + '%'; } }
    const prog = Math.min(100, (p.x / (CONFIG.zoneLen * CONFIG.zones.length)) * 100).toFixed(1); if (prog !== L.prog) { L.prog = prog; el.fill.style.width = prog + '%'; this.root.querySelectorAll('[data-dot]').forEach(d => d.classList.toggle('on', +d.dataset.dot <= g.zone)); }
    const portrait = this.root.clientHeight > this.root.clientWidth * 1.05; if (portrait !== L.portrait) { L.portrait = portrait; el.rot.hidden = !(portrait && this.touch && g.phase === 'running'); }
  }
  destroy() { this.off?.(); clearTimeout(this.toastTimer); this.root.innerHTML = ''; this.root.classList.remove('x2r'); }
}
