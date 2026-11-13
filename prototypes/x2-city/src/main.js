// Точка входа: mountGame(root, options) → { destroy, ... }. Игра грузится только по кнопке «Играть» на странице сайта.
import { THREE, tileMats } from './kit.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CONFIG } from '../../x2-run/src/config.js';
import { Sfx } from '../../x2-run/src/audio.js';
import { Music } from './music.js';
import { bindInput } from './input.js';
import { mountUI, fmt } from './ui.js';
import { Level1 } from './l1.js';
import { Level2 } from './l2.js';
import { Level3 } from './l3.js';
import { Level4 } from './l4.js';

const LEVELS = [Level1, Level2, Level3, Level4];
const SOUND_AS = { rescue: 'pickup', crush: 'explosion', cageLost: 'explosion', helperLost: 'hit', unlay: 'ping' };
const loadImg = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
function fallbackTile() { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#d9d2c6'; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '90,80,70'},${Math.random() * 0.12})`; x.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); } return c; }

export function mountGame(root, options = {}) {
  const tiles = options.tiles || [], reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, touch = options.touch ?? matchMedia('(pointer: coarse)').matches;
  let quality = options.quality || (touch || (navigator.hardwareConcurrency || 8) <= 4 ? 'low' : 'high');
  const ui = mountUI(root, CONFIG.player.maxHearts, touch), canvas = root.querySelector('canvas');
  const R = new THREE.WebGLRenderer({ canvas, antialias: quality === 'high', powerPreference: 'high-performance' });
  R.outputEncoding = THREE.sRGBEncoding; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.0; R.shadowMap.type = THREE.PCFSoftShadowMap;
  const sfx = new Sfx(), music = new Music(sfx);
  let level = null, li = 0, phase = 'menu', comp = null, raf = 0, last = 0, slow = 0, dead = false, total = { area: 0, helpers: 0, total: 0, time: 0 }, hintT = 0, hintI = 0, hints = [], best = 0, offEv = null;
  try { best = +localStorage.getItem('x2c:best') || 0; } catch { /* нет доступа к хранилищу */ }
  const active = () => phase === 'play';
  const input = bindInput(root, { active, onPause: () => { if (phase === 'play') { pause(); return true; } if (phase === 'pause') { resume(); return true; } return false; }, onFirst: () => sfx.init() });

  function applyQuality() { const hi = quality === 'high'; R.setPixelRatio(Math.min(devicePixelRatio || 1, hi ? 2 : 1.25)); R.shadowMap.enabled = hi; resize(); }
  function resize() { const w = root.clientWidth || 1280, h = root.clientHeight || 720; R.setSize(w, h, false); comp?.setSize(w, h); level?.resize(w / h); }
  async function load(i) {
    li = i; offEv?.(); level?.dispose();
    const tl = tiles[i % Math.max(1, tiles.length)], img = (tl && await loadImg(tl.img)) || fallbackTile();
    if (dead) return;
    level = new LEVELS[i]({ tm: tileMats(img), quality, reduced, touch });
    offEv = level.game.on(e => { sfx.play(SOUND_AS[e.type] ? { type: SOUND_AS[e.type] } : e); if ((e.type === 'hit' || e.type === 'fall') && !reduced) navigator.vibrate?.(40); if (e.type === 'rescue') ui.toast(`Помощник в бригаде: ${e.helpers}`, 1500); });
    comp = null; if (quality === 'high') { comp = new EffectComposer(R); comp.addPass(new RenderPass(level.scene, level.cam)); comp.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), reduced ? 0.12 : 0.2, 0.5, 0.93)); }
    music.setLevel(i); applyQuality();
  }
  const HINTS = touch ? [[1, root.clientHeight > root.clientWidth * 1.15 ? 'Поверните телефон горизонтально — так удобнее' : 'Крестовина — бежать'], [4, 'A — прыжок'], [7, 'B — огонь, держите'], [11, 'Стреляйте по клетке — помощник пойдёт за вами'], [15, 'Не стойте: укладчик догоняет']]
    : [[1, 'A и D — бежать'], [4, 'Пробел — прыжок'], [7, 'J или кнопка мыши — огонь, держите'], [11, 'Стреляйте по клетке — помощник пойдёт за вами'], [15, 'W — прицел вверх. Не стойте: укладчик догоняет']];
  function play() { input.release(); level.start(); phase = 'play'; ui.show(null); hintT = 0; hintI = 0; hints = li === 0 ? HINTS : level.hints || []; sfx.init(); music.start();
    const tl = tiles[li % Math.max(1, tiles.length)]; ui.banner(`Уровень ${li + 1} из ${LEVELS.length}${tl ? ' · ' + tl.name : ''}`, level.name, level.hint); canvas.focus({ preventScroll: true }); }
  function pause() { if (phase !== 'play') return; phase = 'pause'; input.release(); music.stop(); ui.show('pause'); }
  function resume() { if (phase !== 'pause') return; phase = 'play'; ui.show(null); music.start(); canvas.focus({ preventScroll: true }); }
  const stat = (l, v, u = '') => `<div><span class="x2c-lbl">${l}</span><b>${v}${u ? ` <small>${u}</small>` : ''}</b></div>`;
  function finishLevel(won) {
    music.stop(); input.release(); const s = level.stats();
    if (!won) { phase = 'lost'; ui.q('[data-losteb]').textContent = `Уровень ${li + 1} · ${level.name}`; ui.show('lost'); return; }
    total.area += s.area; total.helpers += s.helpers; total.total += s.total; total.time += s.time;
    if (li + 1 < LEVELS.length) { phase = 'next'; ui.q('[data-nexteb]').textContent = `Уровень ${li + 1} пройден`; ui.q('[data-nexth]').textContent = level.name; ui.q('[data-nextstats]').innerHTML = stat('Уложено', fmt(s.area), 'м²') + stat('Бригада', s.helpers, 'из ' + s.total) + stat('Время', ui.mmss(s.time)); ui.show('next'); return; }
    phase = 'end'; const rec = total.area > best; if (rec) { best = total.area; try { localStorage.setItem('x2c:best', String(best)); } catch { /* нет доступа */ } }
    ui.q('[data-endeb]').textContent = `Игра пройдена · ${ui.mmss(total.time)}`; ui.q('[data-endh]').textContent = total.helpers >= total.total ? 'Вся бригада дома. Квартал светится' : 'Квартал снова светится';
    ui.q('[data-endstats]').innerHTML = stat('Уложено', fmt(total.area), 'м²') + stat('Бригада', total.helpers, 'из ' + total.total) + stat(rec ? 'Новый рекорд' : 'Рекорд', fmt(best), 'м²');
    ui.q('[data-cols]').innerHTML = tiles.map((t, i) => `<a href="${t.url}" class="${i < LEVELS.length ? '' : 'off'}"><img src="${t.img}" alt="" loading="lazy">${t.name}</a>`).join('');
    ui.q('[data-colurl]').href = options.x2Url || tiles[0]?.url || '#'; ui.show('end');
  }
  async function share() { const text = `Я уложил ${fmt(total.area)} м² керамогранита X2 в игре Italon Experience`, url = options.shareUrl || location.href;
    try { if (navigator.share) await navigator.share({ title: 'X2 / ГОРОД', text, url }); else { await navigator.clipboard.writeText(`${text} — ${url}`); ui.q('[data-act="share"]').textContent = 'Ссылка скопирована'; } } catch { /* отменено пользователем */ } }

  const onClick = async e => { const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return; sfx.init();
    if (a === 'start' || a === 'retry') play();
    else if (a === 'again') { total = { area: 0, helpers: 0, total: 0, time: 0 }; await load(0); play(); }
    else if (a === 'next') { await load(li + 1); play(); }
    else if (a === 'pause') pause(); else if (a === 'resume') resume();
    else if (a === 'menu') { music.stop(); total = { area: 0, helpers: 0, total: 0, time: 0 }; phase = 'menu'; if (li) await load(0); else level.game.reset(), level.reset(); ui.show('menu'); }
    else if (a === 'sound') { sfx.setMuted(!sfx.muted); ui.sound(!sfx.muted); }
    else if (a === 'share') share(); };
  root.addEventListener('click', onClick);
  const onVis = () => { if (document.hidden) pause(); }; document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(resize); ro.observe(root);

  function frame(now) {
    if (dead) return; raf = requestAnimationFrame(frame);
    const raw = last ? (now - last) / 1000 : 0, dt = Math.min(raw, 0.05); last = now; if (!level) return;
    input.poll();
    if (phase === 'play') { level.setInput(input.inp); level.update(dt); ui.hud(level.hud());
      hintT += dt; if (hintI < hints.length && hintT > hints[hintI][0]) ui.toast(hints[hintI++][1], 2800);
      music.tense = level.game.chaser && level.game.chaser.x > level.game.player.x - 420 ? 1 : 0;
      const st = level.state; if (st !== 'running') finishLevel(st === 'won');
      if (quality === 'high' && !options.quality) { slow = raw > 1 / 26 ? slow + raw : Math.max(0, slow - raw * 0.5); if (slow > 2.5) { quality = 'low'; comp = null; applyQuality(); } } }
    if (phase !== 'pause') level.frame(phase === 'play' ? dt : dt * 0.25);
    if (comp) comp.render(); else R.render(level.scene, level.cam);
  }
  ui.sound(!sfx.muted); ui.show('menu');
  const ready = load(0).then(() => { if (!dead) raf = requestAnimationFrame(frame); });
  return { ready, get level() { return level; }, get phase() { return phase; }, input, play, pause, resume, goto: async i => { await load(i); play(); }, advance(sec) { for (let i = 0; i < sec * 60 && phase === 'play'; i++) { level.setInput(input.inp); level.game.step(1 / 60); } },
    destroy() { dead = true; cancelAnimationFrame(raf); music.stop(); input.destroy(); offEv?.(); level?.dispose(); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); root.removeEventListener('click', onClick); R.dispose(); R.forceContextLoss?.(); root.innerHTML = ''; } };
}
