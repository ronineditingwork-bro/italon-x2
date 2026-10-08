// Интерфейс: HUD, меню, пауза, результат. Разметка создаётся модулем, внешних файлов не нужно.
import { CONFIG } from './config.js';
import { CSS } from './styles.js';

const fmtArea = v => v.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtTime = s => { const t = Math.ceil(s); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

export function mountMarkup(root) {
  if (!document.getElementById('x2g-style')) { const st = document.createElement('style'); st.id = 'x2g-style'; st.textContent = CSS; document.head.appendChild(st); }
  root.classList.add('x2g');
  const zones = CONFIG.zones;
  root.innerHTML = `
<canvas data-view tabindex="0" aria-label="Игровая сцена X2 / ГОРОД"></canvas>
<div class="hud" data-hud hidden>
  <div class="pill brand"><div class="col"><span><b>X2</b> / ГОРОД</span><small data-zone>${zones[0].name}</small></div></div>
  <div class="pill score" aria-live="off">Уложено <b data-area>0,0</b> м²</div>
  <div class="pill timer"><span data-time aria-label="Осталось времени">01:00</span><button data-act="pause" aria-label="Пауза">❚❚</button></div>
  <div class="lives" data-lives aria-label="Осталось попыток">Попытки ${'<i></i>'.repeat(CONFIG.run.lives)}</div>
  <div class="wide" data-wide hidden>Широкая укладка <span data-wide-t></span></div>
  <div class="toast" data-toast></div>
  <div class="touch" data-touch hidden>
    <div class="lr"><button data-act="left" aria-label="Влево">◀</button><button data-act="right" aria-label="Вправо">▶</button></div>
    <button data-act="jump" aria-label="Прыжок">▲</button>
  </div>
  <div class="zonebar">
    <div class="rail"><i data-fill></i>${zones.map((_, i) => `<s style="left:${(i / (zones.length - 1)) * 100}%"></s>`).join('')}</div>
    <ol class="zonelist">${zones.map(z => `<li>${z.name}</li>`).join('')}</ol>
    <p class="hint" data-hint>Свайп — сменить полосу</p>
  </div>
</div>
<section class="overlay menu" data-menu>
  <div class="card" role="dialog" aria-labelledby="x2-title">
    <h1 id="x2-title"><b>X2</b> / ГОРОД</h1>
    <p>Маленький робот с коробкой X2 на спине бежит по кварталу и меняет старое покрытие на утолщённый керамогранит X2 (20&nbsp;мм). Уложите как можно больше за 60&nbsp;секунд: парковка, подъезд к дому, тротуар и территория у бассейна.</p>
    <dl>
      <dt class="pc">Компьютер</dt><dd class="pc">← → — сменить полосу · Пробел — прыжок · Esc — пауза</dd>
      <dt class="ph">Телефон</dt><dd class="ph">свайп влево или вправо — полоса · свайп вверх или кнопка — прыжок</dd>
      <dt>Коробки X2</dt><dd>укладка сразу на все три полосы на ${CONFIG.run.wideDuration}&nbsp;секунды</dd>
      <dt>Попытки</dt><dd>${CONFIG.run.lives} столкновения — и забег окончен. Низкие препятствия можно перепрыгнуть</dd>
    </dl>
    <div class="row"><button class="btn" data-act="start">Начать забег</button></div>
    <div class="opts">
      <label>Качество <select data-quality><option value="auto">Авто</option><option value="high">Высокое</option><option value="low">Сниженное</option></select></label>
      <label><input type="checkbox" data-touch-toggle> Экранные кнопки</label>
    </div>
  </div>
</section>
<section class="overlay" data-pause hidden>
  <div class="card" role="dialog" aria-labelledby="x2-pause"><h2 id="x2-pause">Пауза</h2><p>Забег остановлен. Возобновление — по вашему действию.</p>
    <div class="row"><button class="btn" data-act="resume">Продолжить</button><button class="btn ghost" data-act="menu">В меню</button></div></div>
</section>
<section class="overlay" data-end hidden>
  <div class="card" role="dialog" aria-labelledby="x2-end"><h2 id="x2-end" data-end-title>Забег окончен</h2><p data-end-text></p>
    <div class="stat"><span class="big" data-end-area>0 м²</span><span>Пройдено зон</span><b data-end-zones>0 из 4</b><span>Осталось попыток</span><b data-end-lives>0</b><span>Собрано коробок X2</span><b data-end-pickups>0</b></div>
    <div class="row"><button class="btn" data-act="again">Ещё раз</button><button class="btn ghost" data-act="menu">В меню</button></div></div>
</section>
<section class="overlay nogl" data-nogl hidden>
  <div class="card"><h2>3D недоступно</h2><p>Не удалось запустить трёхмерную графику: браузер или устройство не поддерживает WebGL либо он отключён. Попробуйте другой браузер или включите аппаратное ускорение.</p>
    <div class="row"><button class="btn ghost" data-act="retry">Повторить</button></div></div>
</section>`;
  return root;
}

export class UI {
  constructor(root, game) {
    this.root = root; this.game = game;
    const q = s => root.querySelector(s);
    this.el = { hud: q('[data-hud]'), menu: q('[data-menu]'), pause: q('[data-pause]'), end: q('[data-end]'), nogl: q('[data-nogl]'),
      area: q('[data-area]'), time: q('[data-time]'), zone: q('[data-zone]'), lives: q('[data-lives]'), wide: q('[data-wide]'), wideT: q('[data-wide-t]'),
      fill: q('[data-fill]'), toast: q('[data-toast]'), touch: q('[data-touch]'), hint: q('[data-hint]'),
      endTitle: q('[data-end-title]'), endText: q('[data-end-text]'), endArea: q('[data-end-area]'), endZones: q('[data-end-zones]'), endLives: q('[data-end-lives]'), endPickups: q('[data-end-pickups]'),
      quality: q('[data-quality]'), touchToggle: q('[data-touch-toggle]') };
    this.zoneItems = [...root.querySelectorAll('.zonelist li')];
    this.dots = [...root.querySelectorAll('.rail s')];
    this.pips = [...this.el.lives.querySelectorAll('i')];
    this.last = {};
    this.toastTimer = 0;
    this.coarse = matchMedia('(pointer: coarse)').matches;
    this.touchOn = this.coarse;
    this.el.touchToggle.checked = this.touchOn;
    this.el.hint.textContent = this.coarse ? 'Свайп — сменить полосу · свайп вверх — прыжок' : '← → — полоса · Пробел — прыжок';
    this.off = game.on(e => this.onEvent(e));
    this.showPhase();
  }

  setTouch(on) { this.touchOn = on; this.el.touch.hidden = !(on && this.game.phase === 'running'); }

  toast(html, ms = 1500) {
    const t = this.el.toast; t.innerHTML = html; t.classList.add('on');
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => t.classList.remove('on'), ms);
  }

  onEvent(e) {
    if (e.type === 'zone') this.toast(`Зона ${e.zone + 1} · <b>${CONFIG.zones[e.zone].name}</b>`);
    if (e.type === 'pickup') this.toast('Коробка <b>X2</b>: широкая укладка', 1200);
    if (e.type === 'end') this.showEnd(e);
    this.showPhase();
  }

  showPhase() {
    const p = this.game.phase, el = this.el;
    el.menu.hidden = p !== 'menu';
    el.hud.hidden = p === 'menu';
    el.pause.hidden = p !== 'paused';
    el.end.hidden = p !== 'ended';
    el.touch.hidden = !(this.touchOn && p === 'running');
    this.last = {};
    this.tick();
  }

  showEnd(e) {
    const s = e.summary, el = this.el;
    el.endTitle.textContent = e.reason === 'time' ? 'Забег пройден' : 'Попытки закончились';
    el.endText.textContent = e.reason === 'time' ? 'Время вышло: вы пробежали весь маршрут.' : `Вы добежали до зоны «${s.lastZone}».`;
    el.endArea.textContent = `Уложено ${fmtArea(s.area)} м²`;
    el.endZones.textContent = `${s.zonesCompleted} из ${s.zonesTotal}`;
    el.endLives.textContent = String(s.lives);
    el.endPickups.textContent = String(s.pickups);
  }

  /** Обновляет только изменившиеся значения. */
  tick() {
    const g = this.game, el = this.el, L = this.last;
    const area = fmtArea(g.area); if (L.area !== area) { el.area.textContent = area; L.area = area; }
    const time = fmtTime(g.timeLeft); if (L.time !== time) { el.time.textContent = time; L.time = time; }
    if (L.zone !== g.zone) {
      L.zone = g.zone; el.zone.textContent = CONFIG.zones[g.zone].name;
      this.zoneItems.forEach((li, i) => li.classList.toggle('on', i === g.zone));
    }
    // шкала идёт от первой точки зоны до последней; точка загорается, когда зона началась
    const pos = Math.min(100, (g.time / (CONFIG.run.zoneDuration * (CONFIG.zones.length - 1))) * 100).toFixed(1);
    if (L.pos !== pos) {
      L.pos = pos; el.fill.style.width = `${pos}%`;
      this.dots.forEach((d, i) => d.classList.toggle('on', g.time >= i * CONFIG.run.zoneDuration - 1e-6));
    }
    if (L.lives !== g.lives) { L.lives = g.lives; this.pips.forEach((p, i) => p.classList.toggle('off', i >= g.lives)); }
    const wide = g.wide > 0; if (L.wide !== wide) { L.wide = wide; el.wide.hidden = !wide; }
    if (wide) { const t = g.wide.toFixed(1); if (L.wt !== t) { L.wt = t; el.wideT.textContent = `${t.replace('.', ',')} с`; } }
  }

  destroy() { this.off?.(); clearTimeout(this.toastTimer); this.root.innerHTML = ''; this.root.classList.remove('x2g'); }
}
