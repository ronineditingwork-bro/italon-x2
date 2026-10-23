// /manager/ — закрытая карточка проекта для менеджера (адрес вида /manager/#OUT-XXXXXXXX). Страница пустая: данные приходят только с токеном менеджера,
// который вводится вручную и хранится до закрытия вкладки. В поисковую выдачу и в публичные каналы эта страница не попадает.
export default {
  path: '/manager/',
  name: 'manager',
  noindex: true,
  title: 'Карточка проекта',
  description: 'Закрытая карточка проекта X2 Outdoor Lab.',
  styles: ['manager'],
  scripts: ['manager'],
  head: '<meta name="referrer" content="no-referrer">',
  render: () => `<section class="mg" data-mg><div class="wrap mg__wrap">
<p class="eyebrow">ЗАКРЫТАЯ КАРТОЧКА</p><h1 class="mg__title" data-mg-title>Проект Outdoor Lab</h1>
<form class="mg__login" data-mg-login><label>Токен менеджера<input type="password" autocomplete="off" data-mg-token required></label><label>Номер проекта<input data-mg-id placeholder="OUT-XXXXXXXX" required pattern="OUT-[A-Z2-9]{8}"></label><button class="btn" type="submit">Открыть</button></form>
<p class="mg__msg" data-mg-msg role="status"></p>
<div data-mg-card hidden></div>
</div></section>`,
};
