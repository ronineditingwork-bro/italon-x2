// Точка входа: mountGame(root, options) монтирует игру в элемент и возвращает { destroy, game, stage }.
// Игре не нужны регистрация, корзина, оплата и передача персональных данных.
import { CONFIG } from './config.js';
import { Game } from './game.js';
import { bindInput } from './input.js';
import { mountMarkup, UI } from './ui.js';
import { Stage, webglSupported } from './render/stage.js';

function autoQuality() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  return coarse || weak ? 'low' : 'high';
}

export function mountGame(root, options = {}) {
  mountMarkup(root);
  const game = new Game(options.seed ?? CONFIG.seed);
  const ui = new UI(root, game);
  let canvas = root.querySelector('[data-view]');
  let stage = null, raf = 0, destroyed = false, last = 0, qualityChoice = options.quality || CONFIG.quality.default;

  const resolveQuality = () => (qualityChoice === 'auto' ? autoQuality() : qualityChoice);
  ui.el.quality.value = qualityChoice;

  function startStage() {
    if (!webglSupported()) { ui.el.nogl.hidden = false; ui.el.menu.hidden = true; return false; }
    try { stage = new Stage(canvas, game, resolveQuality()); ui.el.nogl.hidden = true; return true; }
    catch (e) { console.error('WebGL init failed', e); stage = null; ui.el.nogl.hidden = false; ui.el.menu.hidden = true; return false; }
  }
  function stopStage(loseContext = false) { stage?.dispose(loseContext); stage = null; }
  function freshCanvas() { const old = root.querySelector('[data-view]'); const c = old.cloneNode(false); old.replaceWith(c); canvas = c; return c; }

  const unbindInput = bindInput(root, game, { onPause: () => game.togglePause() });

  const act = e => {
    const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
    if (a === 'start' || a === 'again') game.start();
    else if (a === 'pause') game.pause();
    else if (a === 'resume') game.resume();
    else if (a === 'menu') { game.reset(); ui.showPhase(); }
    else if (a === 'retry') { stopStage(true); freshCanvas(); if (startStage()) { ui.showPhase(); } }
    canvas.focus?.({ preventScroll: true });
  };
  root.addEventListener('click', act);

  ui.el.quality.addEventListener('change', () => {
    qualityChoice = ui.el.quality.value;
    stopStage(true); freshCanvas(); startStage();
    stage?.update(0, true);
  });
  ui.el.touchToggle.addEventListener('change', () => ui.setTouch(ui.el.touchToggle.checked));

  // вкладка скрыта — пауза; возобновление только по действию игрока
  const onVisibility = () => { if (document.hidden) game.pause(); };
  document.addEventListener('visibilitychange', onVisibility);
  const ro = new ResizeObserver(() => stage?.resize());
  ro.observe(root);

  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0); last = now;
    if (game.phase === 'running') game.step(dt);
    stage?.update(dt, game.phase === 'paused');
    ui.tick();
  }

  if (startStage()) { game.reset(); }
  raf = requestAnimationFrame(frame);

  const api = {
    game, ui,
    get stage() { return stage; },
    /** Для проверок: прокручивает игру и сцену вперёд без реального времени. */
    advance(seconds, dt = 1 / 60, draw = true) { const n = Math.max(1, Math.round(seconds / dt)); for (let i = 0; i < n; i++) { game.step(dt); stage?.update(dt, game.phase === 'paused', draw && i === n - 1); } ui.tick(); },
    destroy() {
      destroyed = true; cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      root.removeEventListener('click', act); ro.disconnect(); unbindInput();
      stopStage(true); ui.destroy();
    },
  };
  return api;
}
