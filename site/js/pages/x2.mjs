// X2: вкладки способов укладки (мышь, касание, клавиатура: стрелки, Home/End). Без JS видны все четыре панели.
const root = document.querySelector('[data-laying-tabs]');
if (root) {
  const list = root.querySelector('[role="tablist"]');
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const panels = tabs.map(t => document.getElementById(t.getAttribute('aria-controls')));
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const select = (i, { focus = false, animate = true } = {}) => {
    tabs.forEach((t, k) => {
      const on = k === i;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      panels[k].hidden = !on;
      if (on) {
        panels[k].classList.add('is-in');
        if (animate && !reduced()) { panels[k].classList.remove('is-entering'); void panels[k].offsetWidth; panels[k].classList.add('is-entering'); }
      }
    });
    if (focus) tabs[i].focus();
  };
  list.hidden = false;
  select(0, { animate: false });
  list.addEventListener('click', e => { const t = e.target.closest('[role="tab"]'); if (t) select(tabs.indexOf(t)); });
  list.addEventListener('keydown', e => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const next = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select((next + tabs.length) % tabs.length, { focus: true });
  });
}
