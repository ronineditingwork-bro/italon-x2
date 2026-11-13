// Классическое управление: WASD/стрелки, пробел — прыжок, J/X/мышь — огонь; на телефоне крестовина и кнопки A/B; геймпад.
const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyK: 'jump', KeyZ: 'jump', KeyJ: 'fire', KeyX: 'fire', ShiftLeft: 'fire', ShiftRight: 'fire', Enter: 'fire' };
const NAMES = ['left', 'right', 'up', 'down', 'jump', 'fire'];

export function bindInput(root, { active, onPause, onFirst } = {}) {
  const src = { kb: {}, touch: {}, pad: {}, mouse: {} }, inp = { left: false, right: false, up: false, down: false, jump: false, fire: false }, off = [];
  const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); off.push(() => el.removeEventListener(ev, fn, opt)); };
  const apply = () => { for (const k of NAMES) inp[k] = !!(src.kb[k] || src.touch[k] || src.pad[k] || src.mouse[k]); if (inp.left && inp.right) inp.left = inp.right = false; };
  const editable = t => !!t?.closest?.('input,textarea,select,[contenteditable="true"],dialog[open]');
  on(window, 'keydown', e => { if (e.ctrlKey || e.metaKey || e.altKey || editable(e.target)) return;
    if (e.code === 'Escape' || e.code === 'KeyP') { if (onPause?.()) e.preventDefault(); return; }
    const k = KEYS[e.code]; if (!k || !active()) return; if (e.code === 'Enter' && e.target.closest?.('button,a')) return; onFirst?.(); src.kb[k] = true; e.preventDefault(); apply(); });
  on(window, 'keyup', e => { const k = KEYS[e.code]; if (k) { src.kb[k] = false; apply(); } });
  on(window, 'blur', () => release());
  const cv = root.querySelector('canvas');
  on(cv, 'pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0 && active()) { onFirst?.(); src.mouse.fire = true; apply(); } });
  on(window, 'pointerup', e => { if (e.pointerType === 'mouse') { src.mouse.fire = false; apply(); } });
  on(root, 'contextmenu', e => e.preventDefault());
  // крестовина: палец можно вести по ней, не отрывая
  const pad = root.querySelector('[data-dpad]'); let padId = null;
  const padSet = e => { const r = pad.getBoundingClientRect(), dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5, t = src.touch;
    t.left = dx < -0.14; t.right = dx > 0.14; t.up = dy < -0.2; t.down = dy > 0.2; pad.dataset.dir = (t.left ? 'l' : t.right ? 'r' : '') + (t.up ? 'u' : t.down ? 'd' : ''); apply(); };
  const padUp = e => { if (e.pointerId !== padId) return; padId = null; const t = src.touch; t.left = t.right = t.up = t.down = false; pad.dataset.dir = ''; apply(); };
  on(pad, 'pointerdown', e => { e.preventDefault(); padId = e.pointerId; try { pad.setPointerCapture(padId); } catch { /* указатель уже отпущен */ } onFirst?.(); padSet(e); });
  on(pad, 'pointermove', e => { if (e.pointerId === padId) padSet(e); }); on(pad, 'pointerup', padUp); on(pad, 'pointercancel', padUp);
  root.querySelectorAll('[data-key]').forEach(b => { const k = b.dataset.key; let id = null;
    on(b, 'pointerdown', e => { e.preventDefault(); id = e.pointerId; try { b.setPointerCapture(id); } catch { /* указатель уже отпущен */ } src.touch[k] = true; b.classList.add('on'); onFirst?.(); apply(); });
    const up = e => { if (e.pointerId !== id) return; id = null; src.touch[k] = false; b.classList.remove('on'); apply(); }; on(b, 'pointerup', up); on(b, 'pointercancel', up); });
  let st = false;
  function poll() { const p = [...(navigator.getGamepads?.() || [])].find(x => x && x.connected); if (!p) { if (src.pad.on) { src.pad = {}; apply(); } return; }
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0, b = i => !!p.buttons[i]?.pressed;
    src.pad = { on: 1, left: ax < -0.4 || b(14), right: ax > 0.4 || b(15), up: ay < -0.5 || b(12), down: ay > 0.5 || b(13), jump: b(0), fire: b(2) || b(1) || b(7) || b(5) };
    if (b(9) && !st) onPause?.(); st = b(9); apply(); }
  function release() { src.kb = {}; src.touch = {}; src.mouse = {}; src.pad = {}; apply(); }
  return { inp, poll, release, destroy() { off.forEach(f => f()); } };
}
