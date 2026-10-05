// Индекс коллекций: переключатель линий (Все / Italon / X2) без перезагрузки.
// Состояние — в адресе (?line=italon|x2), чтобы ссылкой можно было поделиться. Без JS видны обе линии.
const root = document.querySelector('[data-cx-switch]');
if (root) {
  const buttons = [...root.querySelectorAll('[data-line]')];
  const sections = [...document.querySelectorAll('[data-line-section]')];
  const status = document.getElementById('cx-status');
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const label = { all: 'все коллекции', italon: 'коллекции Italon', x2: 'коллекции X2' };

  const apply = (line, { announce = false, animate = false } = {}) => {
    if (!['all', 'italon', 'x2'].includes(line)) line = 'all';
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.line === line));
    sections.forEach((s, i) => {
      const show = line === 'all' || s.dataset.lineSection === line;
      s.hidden = !show;
      // фон чередуется только когда видны обе линии
      s.classList.toggle('section--alt', line === 'all' && i > 0);
      if (show && animate && !reduced()) {
        s.classList.remove('is-entering'); void s.offsetWidth; s.classList.add('is-entering');
        for (const el of s.querySelectorAll('[data-reveal]')) el.classList.add('is-in');
      }
    });
    if (announce && status) {
      const n = sections.filter(s => !s.hidden).reduce((sum, s) => sum + s.querySelectorAll('.ctile').length, 0);
      status.textContent = `Показаны ${label[line]}: ${n}`;
    }
    const params = new URLSearchParams(location.search);
    if (line === 'all') params.delete('line'); else params.set('line', line);
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
  };

  root.hidden = false;
  const fromHash = location.hash.slice(1);
  const initial = new URLSearchParams(location.search).get('line') || (['italon', 'x2'].includes(fromHash) ? fromHash : 'all');
  apply(initial);
  root.addEventListener('click', event => {
    const b = event.target.closest('[data-line]');
    if (!b || b.getAttribute('aria-pressed') === 'true') return;
    apply(b.dataset.line, { announce: true, animate: true });
    // если переключатель «прилип» к шапке, возвращаем к началу списка
    const first = sections.find(s => !s.hidden);
    const bar = root.closest('.cx-bar');
    if (first && bar && first.getBoundingClientRect().top < bar.getBoundingClientRect().bottom) {
      window.scrollTo({ top: window.scrollY + first.getBoundingClientRect().top - bar.getBoundingClientRect().bottom, behavior: reduced() ? 'auto' : 'smooth' });
    }
  });
}
