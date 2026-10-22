// Точка входа: mountGame(root, options) монтирует игру в элемент и возвращает { destroy, game, advance, renderer }.
// Игре не нужны регистрация, корзина, оплата и передача персональных данных. Рекорд хранится только в браузере игрока.
import { CONFIG } from './config.js';
import { Game } from './game.js';
import { bindInput } from './input.js';
import { mountMarkup, UI } from './ui.js';
import { Renderer } from './render.js';
import { Sfx, Music } from './audio.js';

function autoQuality() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  return coarse || weak ? 'low' : 'high';
}

export function mountGame(root, options = {}) {
  mountMarkup(root);
  const game = new Game(options.seed ?? CONFIG.seed);
  const sfx = new Sfx();
  const music = new Music(sfx);
  const ui = new UI(root, game, sfx);
  const canvas = root.querySelector('[data-view]');
  let quality = options.quality || autoQuality();
  let renderer = new Renderer(canvas, game, quality);
  let raf = 0, destroyed = false, last = 0, slow = 0;

  const unSfx = game.on(e => {
    sfx.play(e);
    if (e.type === 'start' || e.type === 'resume') { music.setZone(game.zone); music.setMode(game.boss ? 'boss' : 'run'); music.start(); }
    else if (e.type === 'pause' || e.type === 'over' || e.type === 'win') music.stop();
    else if (e.type === 'zone') music.setZone(e.zone);
    else if (e.type === 'bossStart') music.setMode('boss');
    else if (e.type === 'bossDefeated') music.setMode('run');
  });
  const input = bindInput(root, game, { onPause: () => { game.togglePause(); ui.showPhase(); }, onFirstInput: () => sfx.init() });

  const act = e => {
    const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
    sfx.init();
    if (a === 'start' || a === 'again') { input.release(); game.start(); ui.showPhase(); }
    else if (a === 'pause') { game.pause(); ui.showPhase(); }
    else if (a === 'resume') { game.resume(); ui.showPhase(); }
    else if (a === 'menu') { music.stop(); input.release(); game.reset(); renderer.shownLaidX = game.laidX; ui.showPhase(); }
    else if (a === 'sound') { sfx.setMuted(!sfx.muted); ui.syncSound(); }
    canvas.focus?.({ preventScroll: true });
  };
  root.addEventListener('click', act);
  ui.el.touchToggle.addEventListener('change', () => ui.setTouch(ui.el.touchToggle.checked));
  ui.el.soundToggle.addEventListener('change', () => { sfx.init(); sfx.setMuted(!ui.el.soundToggle.checked); ui.syncSound(); });

  // вкладка скрыта — пауза; продолжение только по действию игрока
  const onVisibility = () => { if (document.hidden && game.phase === 'running') { game.pause(); input.release(); ui.showPhase(); } };
  document.addEventListener('visibilitychange', onVisibility);
  const ro = new ResizeObserver(() => renderer.resize());
  ro.observe(root);

  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const raw = last ? (now - last) / 1000 : 0, dt = Math.min(0.05, raw); last = now;
    // «Авто»: на «высоком» качестве кадры стабильно медленнее ~28 к/с — молча переходим на лёгкое
    if (!options.quality && quality === 'high' && game.phase === 'running' && raw > 0) {
      slow = raw > 0.036 ? slow + raw : Math.max(0, slow - raw * 2);
      if (slow > 2.5) { quality = 'low'; renderer.dispose(); renderer = new Renderer(canvas, game, quality); }
    }
    input.poll();
    if (game.phase === 'running') game.update(dt);
    if (game.phase !== 'paused') renderer.update(dt);
    renderer.draw(); ui.tick();
  }
  raf = requestAnimationFrame(frame);

  return {
    game, ui, sfx,
    get renderer() { return renderer; },
    setQuality(q) { quality = q; renderer.dispose(); renderer = new Renderer(canvas, game, q); },
    /** Для проверок: прокручивает игру вперёд без реального времени. */
    advance(seconds, dt = 1 / 60, draw = true) {
      const n = Math.max(1, Math.round(seconds / dt));
      for (let i = 0; i < n; i++) { if (game.phase === 'running') game.update(dt); renderer.update(dt); if (draw && i === n - 1) renderer.draw(); }
      ui.tick();
    },
    destroy() {
      destroyed = true; cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      root.removeEventListener('click', act); ro.disconnect(); input.destroy(); unSfx(); music.stop(); renderer.dispose(); ui.destroy();
    },
  };
}
