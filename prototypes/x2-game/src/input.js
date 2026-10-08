// Управление: стрелки/A,D, пробел, Esc; свайпы по сцене; экранные кнопки. Только вызывает методы игры.
export function bindInput(root, game, { onPause } = {}) {
  const cleanups = [];
  const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); cleanups.push(() => el.removeEventListener(ev, fn, opt)); };

  on(window, 'keydown', e => {
    if (e.repeat && e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
    const k = e.code;
    if (k === 'ArrowLeft' || k === 'KeyA') { game.moveLane(-1); e.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'KeyD') { game.moveLane(1); e.preventDefault(); }
    else if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') { if (game.phase === 'running') { game.jump(); e.preventDefault(); } }
    else if (k === 'Escape' || k === 'KeyP') { if (game.phase === 'running' || game.phase === 'paused') { onPause?.(); e.preventDefault(); } }
  });

  // свайпы: влево/вправо — полоса, вверх — прыжок
  let start = null;
  const isView = e => !!e.target.closest?.('[data-view]');
  on(root, 'pointerdown', e => { if (!isView(e) || (e.pointerType === 'mouse' && e.button !== 0)) return; start = { x: e.clientX, y: e.clientY, done: false }; e.target.setPointerCapture?.(e.pointerId); });
  on(root, 'pointermove', e => {
    if (!start || start.done || game.phase !== 'running') return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.abs(dx) > 34 && Math.abs(dx) > Math.abs(dy)) { game.moveLane(dx > 0 ? 1 : -1); start.done = true; }
    else if (dy < -46 && Math.abs(dy) > Math.abs(dx)) { game.jump(); start.done = true; }
  });
  const end = () => { start = null; };
  on(root, 'pointerup', end); on(root, 'pointercancel', end);

  // экранные кнопки
  const press = (sel, fn) => { const b = root.querySelector(sel); if (!b) return; on(b, 'pointerdown', e => { e.preventDefault(); fn(); }); };
  press('[data-act="left"]', () => game.moveLane(-1));
  press('[data-act="right"]', () => game.moveLane(1));
  press('[data-act="jump"]', () => game.jump());

  return () => cleanups.forEach(fn => fn());
}
