// Плавная прокрутка Lenis — только компьютер с мышью. Одна петля requestAnimationFrame на двоих: GSAP ticker.
import Lenis from 'lenis';

export function createScroll(gsap, ScrollTrigger) {
  const html = document.documentElement;
  const headerH = () => (document.querySelector('.site-header')?.offsetHeight || 72) + 16;   // якоря не прячутся под шапкой
  const lenis = new Lenis({
    duration: 1.05, wheelMultiplier: 0.9, smoothWheel: true,
    anchors: { offset: -headerH() },
    prevent: node => Boolean(node?.closest?.('dialog, [data-lenis-prevent]')),                 // меню, поиск, корзина скроллятся сами
  });
  lenis.on('scroll', ScrollTrigger.update);
  const tick = time => lenis.raf(time * 1000);
  gsap.ticker.add(tick); gsap.ticker.lagSmoothing(0);
  // пока открыт диалог, прокрутка фона остановлена; после закрытия возобновляется
  const syncModal = () => html.classList.contains('has-dialog') ? lenis.stop() : lenis.start();
  const obs = new MutationObserver(syncModal); obs.observe(html, { attributes: true, attributeFilter: ['class'] }); syncModal();
  return { lenis, destroy() { obs.disconnect(); gsap.ticker.remove(tick); gsap.ticker.lagSmoothing(500, 33); lenis.destroy(); } };
}
