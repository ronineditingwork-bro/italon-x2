// GSAP + Lenis for a small number of editorial pages.
// React Bits Magnet / 21st.dev spotlight are adapted as native DOM effects:
// no React runtime, no changes to the product configurator or Material Lab.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { reducedMotion } from './ui.mjs';

const fineDesktop = () => window.matchMedia?.('(min-width: 960px) and (hover: hover) and (pointer: fine)').matches;

export function initMotion() {
  // Native scrolling and static presentation are always preserved for touch,
  // accessibility settings, printers, and unsupported browsers.
  if (reducedMotion() || !fineDesktop()) return;
  if (document.documentElement.classList.contains('motion-enhanced')) return;

  gsap.registerPlugin(ScrollTrigger);
  const html = document.documentElement;
  let lenis;
  try {
    lenis = new Lenis({
      duration: 1.05,
      wheelMultiplier: 0.9,
      smoothWheel: true,
      anchors: true,
      prevent: node => Boolean(node?.closest?.('dialog, [data-lenis-prevent]')),
    });
  } catch (error) {
    console.warn('Lenis unavailable; keeping native scroll.', error);
  }

  if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
    const tick = time => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    const syncModal = () => html.classList.contains('has-dialog') ? lenis.stop() : lenis.start();
    const dialogObserver = new MutationObserver(syncModal);
    dialogObserver.observe(html, { attributes: true, attributeFilter: ['class'] });
    syncModal();
    // Clean up listeners if the page leaves the browser's page cache.
    window.addEventListener('pagehide', event => {
      if (event.persisted) return;
      dialogObserver.disconnect();
      gsap.ticker.remove(tick);
      lenis.destroy();
    }, { once: true });
  }

  for (const image of document.querySelectorAll('[data-motion-parallax]')) {
    const section = image.closest('section') || image;
    gsap.fromTo(image,
      { yPercent: -2.5, scale: 1.08 },
      { yPercent: 2.5, scale: 1.08, ease: 'none',
        scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true } });
  }

  // React Bits-style magnetic microinteraction, reimplemented in vanilla JS.
  for (const button of document.querySelectorAll('[data-motion-magnet]')) {
    button.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse') return;
      const r = button.getBoundingClientRect();
      gsap.to(button, {
        x: (event.clientX - r.left - r.width / 2) * 0.12,
        y: (event.clientY - r.top - r.height / 2) * 0.12,
        duration: 0.25, ease: 'power2.out', overwrite: true,
      });
    });
    button.addEventListener('pointerleave', () =>
      gsap.to(button, { x: 0, y: 0, duration: 0.35, ease: 'power2.out', overwrite: true }));
  }

  // 21st.dev-inspired cursor spotlight, CSS renders the effect.
  for (const card of document.querySelectorAll('[data-motion-spotlight]')) {
    card.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse') return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--spot-x', `${event.clientX - r.left}px`);
      card.style.setProperty('--spot-y', `${event.clientY - r.top}px`);
    }, { passive: true });
  }

  html.classList.add('motion-enhanced');
  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
}
