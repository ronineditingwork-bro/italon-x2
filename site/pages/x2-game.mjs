// /x2/game/ — мини-игра «X2 / ГОРОД». Игра грузится только по кнопке «Играть» (скрипт игры не нужен тем, кто её не открывал).
// Исходники игры лежат в prototypes/x2-run и собираются в этот же бандл (site/js/pages/x2-game.mjs).
import { esc, ARROW } from '../shared/format.mjs';
import { pageHead } from '../shared/blocks.mjs';
import { stats, products } from '../data.mjs';

// Плитка по уровням: фото берутся из каталога при сборке; если позиции нет — в игре будет рисованная плитка.
const LEVEL_TILES = [['x2-magma', 'Магма X2', 'АЙС'], ['x2-climb', 'Клаймб X2', 'РОУП'], ['x2-materia', 'Материя X2', 'МАГНЕЗИО'], ['x2-aura', 'Аура X2', 'ГОЛД']];
function gameTiles(ctx) {
  return LEVEL_TILES.map(([id, name, tone]) => {
    const list = products.filter(p => p.collectionId === id && p.image?.src && p.image.height >= p.image.width);
    const p = list.find(q => q.name.includes(tone)) || list[0];
    return p ? { name, img: ctx.url(p.image.src), url: ctx.url(`/collections/${id}/`) } : null;
  }).filter(Boolean);
}

export default {
  path: '/x2/game/',
  title: 'Игра X2 / ГОРОД',
  description: 'Мини-игра Italon Experience: робот X2 собирает бригаду укладчиков, уводит её от ржавой техники и укладывает керамогранит X2 толщиной 20 мм — за ним в квартале снова загорается свет. Управление с клавиатуры, мышью и кнопками на экране.',
  styles: ['x2-game'],
  scripts: ['x2-game'],
  render: ctx => `${pageHead(ctx, {
    crumbs: [['X2 · улица', '/x2/'], ['Игра']],
    eyebrow: 'Игра',
    title: 'X2 / ГОРОД',
    lead: 'Квартал погас под старым покрытием. Робот X2 собирает бригаду укладчиков, уводит её от ржавой техники и укладывает плиты 20&nbsp;мм — настоящие коллекции X2 из каталога. Там, где легла плитка, снова загорается свет.',
    aside: `<a class="link-arrow" href="${ctx.url('/x2/')}">О керамограните X2 ${ARROW}</a>`,
  })}
<section class="section x2-game" aria-labelledby="game-title">
<div class="wrap">
<h2 class="sr-only" id="game-title">Игра</h2>
<div class="x2-game__stage" data-x2-game data-tiles="${esc(JSON.stringify(gameTiles(ctx)))}" data-x2-url="${ctx.url('/x2/')}">
<div class="x2-game__view" data-x2-game-view></div>
<div class="x2-game__poster" data-x2-game-poster>
<p class="x2-game__poster-kicker">Italon Experience</p>
<p class="x2-game__poster-title">X2 <span>/ ГОРОД</span></p>
<p class="x2-game__poster-text">Бегите, прыгайте и стреляйте плитами. Освобождайте помощников из клеток и не давайте асфальтоукладчику вас догнать: каждый пройденный метр — это уложенная плитка X2.</p>
<button type="button" class="btn" data-x2-game-start>Играть</button>
<p class="x2-game__poster-note t-small" data-x2-game-status role="status"></p>
<noscript><p class="x2-game__poster-note t-small">Для игры нужен включённый JavaScript.</p></noscript>
</div>
<button type="button" class="x2-game__full" data-x2-game-full hidden aria-label="Игра на весь экран">
<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/></svg>
</button>
</div>
<div class="x2-game__help" data-reveal>
<dl class="specs">
<div><dt>Компьютер</dt><dd>A и D или ← → — бежать; W — прицел вверх; S — пригнуться; пробел — прыжок; J или кнопка мыши — огонь (держите — очередь); Esc — пауза. Работает и геймпад.</dd></div>
<div><dt>Телефон</dt><dd>крестовина слева — бег и прицел, кнопка A — прыжок, B — огонь; игра открывается на весь экран, удобнее держать телефон горизонтально</dd></div>
<div><dt>Бригада и бонусы</dt><dd>выстрел по клетке освобождает помощника — он идёт за роботом; за каждую ошибку бригада теряет одного. Дроны с коробками дают Веер, Скорострел, Тяжёлую плиту, Щит и Сердце.</dd></div>
</dl>
<p class="t-small x2-game__note">Игра — демонстрация. Площадь в ней условная и не связана с расчётом заказа; для расчёта упаковок есть <a class="link" href="${ctx.url('/calculator/')}">калькулятор</a>. Рекорд хранится только в вашем браузере.</p>
<div class="btn-row"><a class="btn btn--outline" href="${ctx.url('/catalog/')}?section=x2">Позиции X2 в каталоге (${esc(String(stats.x2))})</a></div>
</div>
</div>
</section>`,
};
