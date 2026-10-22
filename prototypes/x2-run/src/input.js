// Управление: клавиатура, экранные кнопки, геймпад. Складывает источники и передаёт игре.
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyZ: 'jump', KeyK: 'jump', KeyX: 'fire', KeyJ: 'fire', ShiftLeft: 'fire', ShiftRight: 'fire', Numpad0: 'fire',
};

export function bindInput(root, game, { onPause, onFirstInput } = {}) {
  const src = { kb: {}, touch: {}, pad: {} };
  const cleanups = [];
  const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); cleanups.push(() => el.removeEventListener(ev, fn, opt)); };
  let jumpWas = false;

  function apply() {
    const g = (k) => !!(src.kb[k] || src.touch[k] || src.pad[k]);
    const i = game.input;
    i.left = g('left') && !g('right') || (g('left') && g('right') && i.left); i.right = g('right') && !g('left') || (g('left') && g('right') && i.right);
    i.up = g('up'); i.down = g('down'); i.fire = g('fire');
    const j = g('jump');
    if (j && !jumpWas) game.pressJump();
    if (!j && jumpWas) game.releaseJump();
    jumpWas = j;
  }

  const editable = t => !!t?.closest?.('input,textarea,select,[contenteditable="true"],dialog[open]');
  on(window, 'keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (editable(e.target)) return;
    const k = KEYS[e.code];
    if (e.code === 'Escape' || e.code === 'KeyP') { if (game.phase === 'running' || game.phase === 'paused') { onPause?.(); e.preventDefault(); } return; }
    if (!k) return;
    if (game.phase !== 'running') { src.kb[k] = false; return; }
    onFirstInput?.();
    src.kb[k] = true; e.preventDefault(); apply();
  });
  on(window, 'keyup', e => { const k = KEYS[e.code]; if (!k) return; src.kb[k] = false; apply(); });
  on(window, 'blur', () => { src.kb = {}; src.touch = {}; apply(); });

  // экранные кнопки: несколько пальцев одновременно
  const held = new Map();
  root.querySelectorAll('[data-key]').forEach(btn => {
    const k = btn.dataset.key;
    on(btn, 'pointerdown', e => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); held.set(e.pointerId, k); src.touch[k] = true; btn.classList.add('on'); onFirstInput?.(); apply(); });
    const up = e => { if (held.get(e.pointerId) === k) { held.delete(e.pointerId); src.touch[k] = [...held.values()].includes(k); btn.classList.remove('on'); apply(); } };
    on(btn, 'pointerup', up); on(btn, 'pointercancel', up); on(btn, 'lostpointercapture', up);
    on(btn, 'contextmenu', e => e.preventDefault());
  });

  // геймпад (стандартная раскладка): крестик/стик — движение и прицел, A — прыжок, X/B/RT — огонь, Start — пауза
  let padStart = false;
  function poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []; const p = [...pads].find(x => x && x.connected);
    if (!p) { if (Object.keys(src.pad).length) { src.pad = {}; apply(); } return; }
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0, b = i => !!p.buttons[i]?.pressed;
    src.pad = { left: ax < -0.4 || b(14), right: ax > 0.4 || b(15), up: ay < -0.5 || b(12), down: ay > 0.5 || b(13), jump: b(0) || b(3), fire: b(2) || b(1) || b(7) || b(5) };
    if (b(9) && !padStart) onPause?.(); padStart = b(9);
    apply();
  }
  return { poll, release() { src.kb = {}; src.touch = {}; src.pad = {}; apply(); }, destroy() { cleanups.forEach(f => f()); } };
}
