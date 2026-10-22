// /x2/game/ — мини-игра «X2 / ГОРОД». Игра грузится только по кнопке «Играть» (скрипт игры не нужен тем, кто её не открывал).
// Исходники игры лежат в prototypes/x2-run и собираются в этот же бандл (site/js/pages/x2-game.mjs).
import { esc, ARROW } from '../shared/format.mjs';
import { pageHead } from '../shared/blocks.mjs';
import { stats } from '../data.mjs';

export default {
  path: '/x2/game/',
  title: 'Игра X2 / ГОРОД',
  description: 'Мини-игра Italon Experience в духе классических «бегалок-стрелялок»: робот X2 бежит по кварталу, стреляет плитами по браку и укладывает новое покрытие X2 толщиной 20 мм. Четыре зоны, четыре босса, управление с клавиатуры и кнопками на экране.',
  styles: ['x2-game'],
  scripts: ['x2-game'],
  render: ctx => `${pageHead(ctx, {
    crumbs: [['X2 · улица', '/x2/'], ['Игра']],
    eyebrow: 'Игра',
    title: 'X2 / ГОРОД',
    lead: 'Робот X2 бежит по кварталу, стреляет плитами по «браку» — потрескавшемуся покрытию и ржавой технике — и укладывает за собой новые плиты 20&nbsp;мм. Парковка, подъезд к дому, тротуар и территория у бассейна: четыре зоны, четыре босса.',
    aside: `<a class="link-arrow" href="${ctx.url('/x2/')}">О керамограните X2 ${ARROW}</a>`,
  })}
<section class="section x2-game" aria-labelledby="game-title">
<div class="wrap">
<h2 class="sr-only" id="game-title">Игра</h2>
<div class="x2-game__stage" data-x2-game>
<div class="x2-game__view" data-x2-game-view></div>
<div class="x2-game__poster" data-x2-game-poster>
<p class="x2-game__poster-kicker">Italon Experience</p>
<p class="x2-game__poster-title">X2 <span>/ ГОРОД</span></p>
<p class="x2-game__poster-text">Бегите, прыгайте и стреляйте плитами. Дроны с коробками X2 дают оружие, а каждый пройденный метр — это уложенная плитка.</p>
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
<div><dt>Компьютер</dt><dd>← → — бежать; ↑ — стрелять вверх; ↓ — пригнуться; пробел или Z — прыжок; X или Shift — огонь (держите — очередь); Esc — пауза</dd></div>
<div><dt>Телефон</dt><dd>кнопки на экране: ◀ ▶ — бег, ▲ — прицел вверх, «Прыжок» и «Огонь»; лучше играть в горизонтальном положении</dd></div>
<div><dt>Бонусы</dt><dd>стреляйте по дронам с коробками: Веер, Скорострел, Тяжёлая плита, Щит и Сердце; ↓ + прыжок — спрыгнуть с уступа</dd></div>
</dl>
<p class="t-small x2-game__note">Игра — демонстрация. Площадь в ней условная (ряд из шести плиток по 0,36&nbsp;м²) и не связана с расчётом заказа; для расчёта упаковок есть <a class="link" href="${ctx.url('/calculator/')}">калькулятор</a>. Названия брендов на старом покрытии — оформление уровня. Рекорд хранится только в вашем браузере.</p>
<div class="btn-row"><a class="btn btn--outline" href="${ctx.url('/catalog/')}?section=x2">Позиции X2 в каталоге (${esc(String(stats.x2))})</a></div>
</div>
</div>
</section>`,
};
