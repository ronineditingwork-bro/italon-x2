// /x2/game/ — мини-игра «X2 / ГОРОД». Игра грузится только по кнопке «Играть» (WebGL и ~600 КБ скрипта не нужны тем, кто её не открывал).
// Исходники игры лежат в prototypes/x2-game и собираются в этот же бандл (site/js/pages/x2-game.mjs).
import { esc, ARROW } from '../shared/format.mjs';
import { pageHead } from '../shared/blocks.mjs';
import { stats } from '../data.mjs';

export default {
  path: '/x2/game/',
  title: 'Игра X2 / ГОРОД',
  description: 'Мини-игра Italon Experience: робот с коробкой X2 бежит по кварталу и меняет старое покрытие на плиты X2 толщиной 20 мм. 60 секунд, четыре зоны, управление с клавиатуры и жестами.',
  styles: ['x2-game'],
  scripts: ['x2-game'],
  render: ctx => `${pageHead(ctx, {
    crumbs: [['X2 · улица', '/x2/'], ['Игра']],
    eyebrow: 'Игра',
    title: 'X2 / ГОРОД',
    lead: 'Маленький робот несёт коробку X2 и на бегу меняет старое покрытие на плиты 20&nbsp;мм: парковка, подъезд к дому, тротуар и территория у бассейна. На забег — 60&nbsp;секунд.',
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
<p class="x2-game__poster-text">Меняйте покрытие на бегу, обходите конусы и барьеры, собирайте коробки X2 — они укладывают сразу три полосы.</p>
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
<div><dt>Компьютер</dt><dd>← → или A D — сменить полосу; пробел или ↑ — прыжок; Esc — пауза</dd></div>
<div><dt>Телефон</dt><dd>свайп влево и вправо — полоса, вверх — прыжок; можно включить экранные кнопки</dd></div>
<div><dt>Попытки</dt><dd>три столкновения — и забег окончен; низкие препятствия можно перепрыгнуть</dd></div>
</dl>
<p class="t-small x2-game__note">Игра — демонстрация. Площадь в ней условная (одна плитка — 0,36&nbsp;м²) и не связана с расчётом заказа; для расчёта упаковок есть <a class="link" href="${ctx.url('/calculator/')}">калькулятор</a>. Названия брендов на старом покрытии — оформление уровня.</p>
<div class="btn-row"><a class="btn btn--outline" href="${ctx.url('/catalog/')}?section=x2">Позиции X2 в каталоге (${esc(String(stats.x2))})</a></div>
</div>
</div>
</section>`,
};
