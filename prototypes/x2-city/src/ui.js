// Интерфейс поверх холста: HUD, экраны, экранные кнопки. Стиль сайта: Inter, белые карточки, тёмный текст.
export const CSS = `
.x2c{--ink:#151515;--ink2:#626262;--line:#dededa;--bg2:#f5f3ef;position:relative;width:100%;height:100%;min-height:300px;overflow:hidden;background:#05060c;color:var(--ink);
font-family:Inter,Arial,"Helvetica Neue",sans-serif;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;touch-action:none}
.x2c *{box-sizing:border-box}.x2c [hidden]{display:none!important}.x2c canvas{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none}
.x2c button,.x2c a.x2c-btn{font:inherit;cursor:pointer}
.x2c-hud{position:absolute;inset:0;pointer-events:none}
.x2c-pill{background:rgba(255,255,255,.94);border:0;border-radius:999px;box-shadow:0 4px 18px rgba(0,0,0,.3);display:flex;align-items:center;gap:8px;height:42px;padding:0 15px;font-weight:600;font-size:14px;white-space:nowrap;color:var(--ink);flex:none}
.x2c-pill svg{flex:none}
.x2c-top{position:absolute;left:14px;right:14px;top:12px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.x2c-grp{display:flex;gap:8px;align-items:center}
.x2c-hearts svg{width:17px;height:17px;fill:#c2362b;transition:fill .2s,transform .2s}.x2c-hearts svg.off{fill:#d9d9d5;transform:scale(.8)}
.x2c-lbl{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink2);font-weight:600}.x2c-num{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums}
.x2c-round{width:42px;padding:0;justify-content:center;pointer-events:auto}.x2c-round svg{width:19px;height:19px;stroke:var(--ink);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.x2c-round:focus-visible,.x2c-btn:focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 5px var(--ink)}
.x2c-bar{width:clamp(70px,16vw,220px);height:5px;background:var(--line);border-radius:5px;overflow:hidden}.x2c-bar b{display:block;height:100%;background:var(--ink);width:0}
.x2c-weapon{position:absolute;left:14px;bottom:14px}
.x2c-toast{position:absolute;left:50%;bottom:16px;transform:translate(-50%,12px);background:rgba(21,21,21,.88);color:#fff;border-radius:999px;padding:11px 20px;font-size:15px;opacity:0;transition:opacity .25s,transform .25s;max-width:92%;white-space:normal;text-align:center}
.x2c-toast.on{opacity:1;transform:translate(-50%,0)}
.x2c-banner{position:absolute;left:0;right:0;top:22%;text-align:center;color:#fff;text-shadow:0 2px 20px rgba(0,0,0,.8);opacity:0;transition:opacity .5s}.x2c-banner.on{opacity:1}
.x2c-banner small{display:block;font-size:12px;letter-spacing:.24em;text-transform:uppercase;opacity:.85;margin-bottom:8px}.x2c-banner b{display:block;font-size:clamp(30px,6vw,60px);font-weight:600;letter-spacing:-.02em;line-height:1}.x2c-banner i{display:block;font-style:normal;font-size:15px;opacity:.9;margin-top:10px}
.x2c-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(4,6,14,.5);animation:x2c-in .3s ease-out;overflow:auto;touch-action:pan-y}
.x2c-overlay.left{justify-content:flex-start;padding-left:max(16px,6%)}
@keyframes x2c-in{from{opacity:0}to{opacity:1}}
.x2c-card{background:#fff;border-radius:6px;box-shadow:0 30px 80px rgba(0,0,0,.45);padding:clamp(20px,4vw,44px);width:min(560px,100%);max-height:100%;overflow:auto;animation:x2c-up .35s cubic-bezier(.22,.61,.36,1)}
.x2c-card.wide{width:min(820px,100%)}
@keyframes x2c-up{from{transform:translateY(14px)}to{transform:none}}
.x2c-eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink2);font-weight:600;margin:0 0 12px}
.x2c-card h1{font-size:clamp(36px,7vw,64px);line-height:1;margin:0 0 16px;font-weight:600;letter-spacing:-.02em}.x2c-card h1 span{color:#8c8c88;font-weight:300}
.x2c-card h2{font-size:clamp(26px,5vw,44px);line-height:1.05;margin:0 0 10px;font-weight:600;letter-spacing:-.02em}
.x2c-card p{font-size:clamp(14px,2vw,17px);line-height:1.55;color:var(--ink2);margin:0 0 20px}
.x2c-keys{display:flex;flex-wrap:wrap;gap:10px 18px;margin:0 0 24px;font-size:14px;color:var(--ink2)}.x2c-keys span{display:flex;align-items:center;gap:6px}
.x2c kbd{font:600 12px Inter,Arial,sans-serif;background:var(--bg2);box-shadow:inset 0 0 0 1px var(--line);color:var(--ink);border-radius:5px;padding:3px 7px;min-width:24px;text-align:center}
.x2c-row{display:flex;gap:10px;flex-wrap:wrap}
.x2c-btn{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 28px;background:var(--ink);color:#fff;font-weight:600;font-size:16px;border:0;border-radius:2px;text-decoration:none;transition:background .18s}
.x2c-btn:hover{background:#3a3a3a}.x2c-btn.out{background:#fff;color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}.x2c-btn.out:hover{background:var(--bg2)}
.x2c-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin:16px 0 22px}
.x2c-stats div{padding:14px 14px 14px 0}.x2c-stats b{display:block;font-size:clamp(22px,4vw,32px);font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}.x2c-stats b small{font-size:14px;color:var(--ink2);font-weight:500}
.x2c-cols{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:0 0 24px}.x2c-cols a{color:inherit;text-decoration:none;font-size:13px;font-weight:600}.x2c-cols img{width:100%;aspect-ratio:1.5;object-fit:cover;display:block;background:var(--bg2);margin-bottom:6px}.x2c-cols a.off{opacity:.35}
.x2c-touch{position:absolute;inset:0;pointer-events:none}
.x2c-dpad{position:absolute;left:max(14px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));width:clamp(132px,36vmin,170px);aspect-ratio:1;pointer-events:auto;touch-action:none}
.x2c-dpad i{position:absolute;background:rgba(255,255,255,.2);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.55);border-radius:10px}
.x2c-dpad i:nth-child(1){left:34%;top:0;width:32%;height:100%}.x2c-dpad i:nth-child(2){top:34%;left:0;height:32%;width:100%}
.x2c-dpad b{position:absolute;width:32%;height:34%;border-radius:10px;transition:background .08s}
.x2c-dpad b.l{left:0;top:33%}.x2c-dpad b.r{right:0;top:33%}.x2c-dpad b.u{left:34%;top:0}.x2c-dpad b.d{left:34%;bottom:0}
.x2c-dpad[data-dir*=l] b.l,.x2c-dpad[data-dir*=r] b.r,.x2c-dpad[data-dir*=u] b.u,.x2c-dpad[data-dir*=d] b.d{background:rgba(255,255,255,.75)}
.x2c-ab{position:absolute;border-radius:50%;border:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;letter-spacing:.08em;text-transform:uppercase;pointer-events:auto;touch-action:none;box-shadow:0 6px 20px rgba(0,0,0,.4);width:clamp(74px,22vmin,100px);aspect-ratio:1}
.x2c-ab.a{right:calc(max(14px,env(safe-area-inset-right)) + clamp(74px,22vmin,100px) + 10px);bottom:max(14px,env(safe-area-inset-bottom));background:rgba(255,255,255,.9);color:var(--ink)}
.x2c-ab.b{right:max(14px,env(safe-area-inset-right));bottom:calc(max(14px,env(safe-area-inset-bottom)) + clamp(40px,11vmin,56px));background:var(--ink);color:#fff}
.x2c-ab.on{transform:scale(.93);filter:brightness(1.3)}
.x2c-rot{position:absolute;left:50%;top:96px;transform:translateX(-50%);font-size:13px;height:auto!important;padding:8px 14px!important;border-radius:14px;white-space:normal;text-align:center;width:max-content;max-width:86%}
@media (max-width:640px),(max-height:480px){.x2c-pill{height:34px;font-size:12px;padding:0 10px;gap:5px}.x2c-round{width:34px;padding:0}.x2c-num{font-size:14px}.x2c-hearts svg{width:13px;height:13px}.x2c-lbl{font-size:8.5px}.x2c-top{left:8px;right:8px;top:8px}.x2c-weapon{display:none}.x2c-toast{bottom:auto;top:52px;font-size:13px;padding:8px 14px}.x2c-banner i{display:none}.x2c-cols{grid-template-columns:repeat(2,1fr)}.x2c-btn{min-height:46px;padding:0 18px;font-size:15px}}
@media (max-width:520px){.x2c-top{flex-wrap:wrap;justify-content:space-between;row-gap:6px}.x2c-top>.x2c-pill{order:3;width:100%;justify-content:center}.x2c-top>.x2c-pill .x2c-bar{flex:1;width:auto}.x2c-toast{top:auto;bottom:calc(clamp(132px,36vmin,170px) + 44px)}}
@media (prefers-reduced-motion:reduce){.x2c-overlay,.x2c-card{animation:none}.x2c-toast,.x2c-banner{transition:none}}
`;
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-5.3-8-11.2A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 8 3.2C20 15.7 12 21 12 21z"/></svg>';
const I_SND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path data-wave d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>', I_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
export const fmt = (v, d = 1) => v.toFixed(d).replace('.', ',');
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function mountUI(root, maxHearts, touch) {
  if (!document.getElementById('x2c-style')) { const st = document.createElement('style'); st.id = 'x2c-style'; st.textContent = CSS; document.head.appendChild(st); }
  root.classList.add('x2c');
  const keys = touch ? '<span>крестовина — бег и прицел</span><span><kbd>A</kbd> прыжок</span><span><kbd>B</kbd> огонь</span>' : '<span><kbd>A</kbd><kbd>D</kbd> бежать</span><span><kbd>W</kbd><kbd>S</kbd> прицел, пригнуться</span><span><kbd>Пробел</kbd> прыжок</span><span><kbd>J</kbd> или мышь — огонь</span><span><kbd>Esc</kbd> пауза</span>';
  root.innerHTML = `<canvas tabindex="0" aria-label="Игра X2 / ГОРОД"></canvas>
<div class="x2c-hud" data-hud hidden>
 <div class="x2c-top"><div class="x2c-grp"><div class="x2c-pill x2c-hearts" data-hearts role="img" aria-label="Жизни">${HEART.repeat(maxHearts)}</div><div class="x2c-pill"><span class="x2c-lbl">Бригада</span><span class="x2c-num" data-helpers>0</span></div></div>
 <div class="x2c-pill"><span class="x2c-lbl" data-midlbl></span><div class="x2c-bar"><b data-mid></b></div></div>
 <div class="x2c-grp"><div class="x2c-pill"><span class="x2c-lbl">Уложено</span><span class="x2c-num" data-area>0,0</span><span class="x2c-lbl">м²</span></div><button class="x2c-pill x2c-round" data-act="sound" aria-label="Звук" aria-pressed="true">${I_SND}</button><button class="x2c-pill x2c-round" data-act="pause" aria-label="Пауза">${I_PAUSE}</button></div></div>
 <div class="x2c-pill x2c-weapon"><span class="x2c-lbl">Плиты</span><span data-weapon></span></div>
 <div class="x2c-banner" data-banner><small data-bsmall></small><b data-btitle></b><i data-btext></i></div>
 <div class="x2c-toast" data-toast role="status"></div>
</div>
<div class="x2c-touch" data-touch hidden><div class="x2c-dpad" data-dpad data-dir="" aria-label="Крестовина"><i></i><i></i><b class="l"></b><b class="r"></b><b class="u"></b><b class="d"></b></div>
 <button class="x2c-ab a" data-key="jump" aria-label="Прыжок">A</button><button class="x2c-ab b" data-key="fire" aria-label="Огонь">B</button></div>
<section class="x2c-overlay left" data-scr="menu"><div class="x2c-card"><p class="x2c-eyebrow">Italon Experience · игра</p><h1>X2 <span>/</span> ГОРОД</h1>
 <p>Квартал погас под старым покрытием. Соберите бригаду роботов-укладчиков, уведите её от ржавой техники и уложите X2 — за вами снова загорится свет.</p>
 <div class="x2c-keys">${keys}</div><div class="x2c-row"><button class="x2c-btn" data-act="start">Играть</button><button class="x2c-btn out" data-act="sound" data-soundtxt>Звук: вкл</button></div></div></section>
<section class="x2c-overlay" data-scr="pause" hidden><div class="x2c-card"><p class="x2c-eyebrow">Пауза</p><h2>Игра остановлена</h2><div class="x2c-keys">${keys}</div><div class="x2c-row"><button class="x2c-btn" data-act="resume">Продолжить</button><button class="x2c-btn out" data-act="sound" data-soundtxt>Звук: вкл</button><button class="x2c-btn out" data-act="menu">В меню</button></div></div></section>
<section class="x2c-overlay" data-scr="lost" hidden><div class="x2c-card"><p class="x2c-eyebrow" data-losteb></p><h2>Бригада отступила</h2><p>Старое покрытие пока держится. Уровень начнётся заново, уложенное на прошлых уровнях сохранится.</p><div class="x2c-row"><button class="x2c-btn" data-act="retry">Ещё раз</button><button class="x2c-btn out" data-act="menu">В меню</button></div></div></section>
<section class="x2c-overlay" data-scr="next" hidden><div class="x2c-card"><p class="x2c-eyebrow" data-nexteb></p><h2 data-nexth></h2><div class="x2c-stats" data-nextstats></div><div class="x2c-row"><button class="x2c-btn" data-act="next">Дальше</button></div></div></section>
<section class="x2c-overlay" data-scr="end" hidden><div class="x2c-card wide"><p class="x2c-eyebrow" data-endeb></p><h2 data-endh></h2><div class="x2c-stats" data-endstats></div>
 <p class="x2c-eyebrow">Вы уложили коллекции</p><div class="x2c-cols" data-cols></div>
 <div class="x2c-row"><a class="x2c-btn" data-colurl href="#">Смотреть коллекции X2</a><button class="x2c-btn out" data-act="again">Ещё раз</button><button class="x2c-btn out" data-act="share">Поделиться</button></div></div></section>`;
  const q = s => root.querySelector(s), last = {};
  const set = (k, v, fn) => { if (last[k] !== v) { last[k] = v; fn(v); } };
  const el = { hud: q('[data-hud]'), touch: q('[data-touch]'), hearts: [...q('[data-hearts]').children], helpers: q('[data-helpers]'), area: q('[data-area]'), mid: q('[data-mid]'), midlbl: q('[data-midlbl]'), weapon: q('[data-weapon]'), toast: q('[data-toast]'), banner: q('[data-banner]') };
  let toastT = 0, bannerT = 0;
  return { el, q,
    show(name) { root.querySelectorAll('[data-scr]').forEach(s => { s.hidden = s.dataset.scr !== name; }); const live = !name; el.hud.hidden = !(live || name === 'pause'); el.touch.hidden = !(live && touch); if (name) q(`[data-scr="${name}"] .x2c-btn`)?.focus({ preventScroll: true }); },
    hud(h) { set('hearts', h.hearts, v => el.hearts.forEach((s, i) => s.classList.toggle('off', i >= v))); set('helpers', h.helpers + '/' + h.total, v => { el.helpers.textContent = v; });
      set('area', fmt(h.area), v => { el.area.textContent = v; }); set('mid', Math.round(h.progress * 100), v => { el.mid.style.width = v + '%'; }); set('midlbl', h.midLabel, v => { el.midlbl.textContent = v; });
      set('weapon', h.weapon + (h.shield > 0 ? ' · щит ' + Math.ceil(h.shield) : ''), v => { el.weapon.textContent = v; }); },
    toast(text, ms = 2600) { el.toast.textContent = text; el.toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.toast.classList.remove('on'), ms); },
    banner(small, title, text) { q('[data-bsmall]').textContent = small; q('[data-btitle]').textContent = title; q('[data-btext]').textContent = text; el.banner.classList.add('on'); clearTimeout(bannerT); bannerT = setTimeout(() => el.banner.classList.remove('on'), 3200); },
    sound(on) { root.querySelectorAll('[data-soundtxt]').forEach(b => { b.textContent = on ? 'Звук: вкл' : 'Звук: выкл'; }); root.querySelectorAll('.x2c-round[data-act="sound"]').forEach(b => { b.setAttribute('aria-pressed', on); b.querySelector('[data-wave]').style.display = on ? '' : 'none'; }); },
    mmss };
}
