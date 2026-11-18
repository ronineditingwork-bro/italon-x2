// Страница игры: сам движок (Canvas 2D, правила, графика) грузится отдельным фрагментом только после нажатия «Играть».
const stage = document.querySelector('[data-x2-game]');
if (stage) {
  const view = stage.querySelector('[data-x2-game-view]');
  const poster = stage.querySelector('[data-x2-game-poster]');
  const startBtn = stage.querySelector('[data-x2-game-start]');
  const status = stage.querySelector('[data-x2-game-status]');
  const fullBtn = stage.querySelector('[data-x2-game-full]');
  let app = null, loading = false;

  const say = text => { if (status) status.textContent = text; };

  async function launch() {
    if (app || loading) return;
    loading = true; startBtn.disabled = true; say('Загрузка игры…');
    try {
      const { mountGame } = await import('../../../prototypes/x2-city/src/main.js');
      let tiles = []; try { tiles = JSON.parse(stage.dataset.tiles || '[]'); } catch { /* без фото — рисованная плитка */ }
      app = mountGame(view, { tiles, x2Url: stage.dataset.x2Url, shareUrl: location.href });
      // на телефоне шапка сайта закрывает игру — открываем её на весь экран
      if (matchMedia('(pointer: coarse)').matches) stage.classList.add('is-max');
      stage.classList.add('is-live'); poster.hidden = true; fullBtn.hidden = !stage.requestFullscreen && !stage.webkitRequestFullscreen;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      stage.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
      view.querySelector('[data-act="start"]')?.focus?.({ preventScroll: true });
      fullBtn.hidden = false;
    } catch (e) {
      console.error('Игра X2 / ГОРОД не загрузилась', e);
      startBtn.disabled = false; say('Не удалось загрузить игру. Проверьте соединение и попробуйте ещё раз.');
    } finally { loading = false; }
  }
  startBtn.addEventListener('click', launch);

  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  fullBtn.addEventListener('click', () => {
    // где полноэкранного режима нет (iPhone) — растягиваем рамку игры на всё окно
    const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
    if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else if (stage.classList.contains('is-max') || !req) stage.classList.toggle('is-max');
    else req.call(stage);
  });

  // при уходе со страницы освобождаем WebGL
  addEventListener('pagehide', () => { app?.destroy(); app = null; });
}
