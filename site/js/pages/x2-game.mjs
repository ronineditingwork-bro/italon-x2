// Страница игры: сам движок (Three.js и правила) грузится отдельным фрагментом только после нажатия «Играть».
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
      const { mountGame } = await import('../../../prototypes/x2-game/src/main.js');
      app = mountGame(view);
      stage.classList.add('is-live'); poster.hidden = true; fullBtn.hidden = !stage.requestFullscreen && !stage.webkitRequestFullscreen;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      stage.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
      view.querySelector('[data-act="start"]')?.focus?.({ preventScroll: true });
    } catch (e) {
      console.error('Игра X2 / ГОРОД не загрузилась', e);
      startBtn.disabled = false; say('Не удалось загрузить игру. Проверьте соединение и попробуйте ещё раз.');
    } finally { loading = false; }
  }
  startBtn.addEventListener('click', launch);

  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  fullBtn.addEventListener('click', () => {
    if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage);
  });

  // при уходе со страницы освобождаем WebGL
  addEventListener('pagehide', () => { app?.destroy(); app = null; });
}
