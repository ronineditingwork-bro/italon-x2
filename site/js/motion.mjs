// Редакционный слой движения: GSAP + ScrollTrigger (+ Lenis на компьютере). Подключается динамически, только на редакционных страницах.
// React Bits (магнитная кнопка) и 21st.dev (подсветка карточки) переписаны на обычном DOM: React не нужен.
// Два уровня:
//   desktop — мышь, ширина от 960 px: плавная прокрутка Lenis, сдвиг фото, магнитные кнопки, подсветка под курсором;
//   lite    — телефон и планшет: родная прокрутка без Lenis, мягкий сдвиг фото, отклик на нажатие (вспышка света на карточке, «пружина» кнопки).
// Весь слой выключается целиком: stop() возвращает страницу к исходному виду без перезагрузки (на этом построено сравнение «как сейчас / с эффектами»).
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { reducedMotion } from './ui.mjs';

const mq = q => !!window.matchMedia?.(q).matches;
const fineDesktop = () => mq('(min-width: 960px) and (hover: hover) and (pointer: fine)');
const html = document.documentElement;
const SPOT = '[data-motion-spotlight]', MAGNET = '[data-motion-magnet]';
gsap.registerPlugin(ScrollTrigger);

let live = null;                                   // { ac, ctx, lenis, tick, tier, amp, token }
export const motionState = () => ({ on: !!live, tier: live?.tier || '', amp: !!live?.amp, reduced: reducedMotion() });

/** Размер света и сдвигов: amp — усиленный показ для сравнения (в рабочей версии выключен). */
const K = amp => amp ? { parallax: 6, magnet: 0.3, shift: 56 } : { parallax: 2.5, magnet: 0.12, shift: 32 };

const mediaOf = el => el.matches('.media') ? el : el.querySelector('.media') || el;   // свет рисуется на фото карточки, а не на тексте под ним

export function start({ amp = false } = {}) {
  if (live || reducedMotion()) return false;
  const tier = fineDesktop() ? 'desktop' : 'lite', k = K(amp), ac = new AbortController(), { signal } = ac, token = Symbol('motion');
  live = { ac, tier, amp, token, lenis: null, tick: null, ctx: null, obs: null };
  html.classList.add('motion-on', `motion-${tier}`);
  if (tier === 'desktop') html.classList.add('motion-enhanced');
  html.classList.toggle('motion-amp', amp); html.style.setProperty('--m-shift', `${k.shift}px`);

  live.ctx = gsap.context(() => {
    // сдвиг фото при прокрутке: только transform, без смены пропорций; запас масштабом, чтобы по краям не было пустоты
    const A = tier === 'desktop' ? k.parallax : Math.min(k.parallax, amp ? 4 : 1.8), scale = 1 + 2 * A / 100 + 0.03;
    for (const image of document.querySelectorAll('[data-motion-parallax]')) {
      gsap.fromTo(image, { yPercent: -A, scale }, { yPercent: A, scale, ease: 'none',
        scrollTrigger: { trigger: image.parentElement || image, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true } });
    }
    if (tier === 'desktop') {
      // магнитная кнопка: небольшой сдвиг к курсору, возврат при уходе
      for (const button of document.querySelectorAll(MAGNET)) {
        const qx = gsap.quickTo(button, 'x', { duration: 0.35, ease: 'power3.out' }), qy = gsap.quickTo(button, 'y', { duration: 0.35, ease: 'power3.out' });
        button.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; const r = button.getBoundingClientRect(); qx((e.clientX - r.left - r.width / 2) * k.magnet); qy((e.clientY - r.top - r.height / 2) * k.magnet); }, { signal });
        button.addEventListener('pointerleave', () => { qx(0); qy(0); }, { signal });
      }
      // подсветка под курсором: свет рисует CSS, JS только передаёт координаты
      for (const card of document.querySelectorAll(SPOT)) {
        const host = mediaOf(card);
        card.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; const r = host.getBoundingClientRect(); host.style.setProperty('--spot-x', `${e.clientX - r.left}px`); host.style.setProperty('--spot-y', `${e.clientY - r.top}px`); }, { passive: true, signal });
      }
    }
  });

  if (tier === 'lite') {
    // сенсорный экран: нажатие даёт заметный, но короткий отклик; наведения мышью на телефоне нет, поэтому его не имитируем
    const press = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); el.addEventListener('animationend', () => el.classList.remove(cls), { once: true }); };
    document.addEventListener('pointerdown', e => {
      const spot = e.target.closest?.(SPOT), magnet = e.target.closest?.(MAGNET);
      if (spot) { const host = mediaOf(spot), r = host.getBoundingClientRect(); host.style.setProperty('--spot-x', `${e.clientX - r.left}px`); host.style.setProperty('--spot-y', `${e.clientY - r.top}px`); press(host, 'm-spot'); }
      if (magnet) press(magnet, 'm-press'); else if (spot) press(spot, 'm-press-soft');
    }, { passive: true, signal });
  }

  // высота страницы меняется, когда догружаются фото и шрифты: пересчитываем точки ScrollTrigger
  let t = 0; const refresh = () => { clearTimeout(t); t = setTimeout(() => ScrollTrigger.refresh(), 120); };
  document.addEventListener('load', e => { if (e.target?.tagName === 'IMG') refresh(); }, { capture: true, signal });
  window.addEventListener('load', refresh, { signal }); document.fonts?.ready.then(refresh);

  if (tier === 'desktop') startLenis(live);
  window.addEventListener('pagehide', e => { if (!e.persisted) stop(); }, { signal });
  return true;
}

function startLenis(state) {
  import('./motion-scroll.mjs').then(({ createScroll }) => {
    if (live !== state) return;                                      // эффекты уже выключили, пока модуль грузился
    state.lenis = createScroll(gsap, ScrollTrigger);
  }).catch(error => console.warn('Smooth scroll unavailable; native scroll kept.', error));
}

export function stop() {
  if (!live) return false;
  const { ac, ctx, lenis } = live; live = null;
  ac.abort(); lenis?.destroy(); ctx.revert();
  for (const el of document.querySelectorAll(`${SPOT}, ${SPOT} .media, ${MAGNET}`)) { el.style.removeProperty('--spot-x'); el.style.removeProperty('--spot-y'); gsap.set(el, { clearProps: 'x,y' }); }
  html.classList.remove('motion-on', 'motion-desktop', 'motion-lite', 'motion-enhanced', 'motion-amp'); html.style.removeProperty('--m-shift');
  return true;
}

/** Вызывается с каждой редакционной страницы. В тестовой сборке запуск делает панель сравнения, в рабочей — сразу. */
export function init({ preview = false } = {}) {
  window.ItalonMotion = { start, stop, state: motionState };
  if (preview) return import('./motion-preview.mjs').then(m => m.mountPanel({ start, stop, state: motionState }));
  start();
}
