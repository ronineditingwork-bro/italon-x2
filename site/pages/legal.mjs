// /privacy/ и /consent/ — политика обработки персональных данных и согласие (152-ФЗ).
// Страницы создаются ТОЛЬКО при сборке с PD_CONSENT=1. Пока тексты не утверждены (PD_LEGAL_APPROVED≠1) — помечены «ЧЕРНОВИК» и закрыты от индексации.
import { pageHead } from '../shared/blocks.mjs';
import { enabled, approved, draftBanner, privacyHtml, consentHtml } from '../legal/texts.mjs';

const make = (path, title, eyebrow, body, lead) => ({
  path, title, description: lead, noindex: !approved, styles: ['legal'],
  render: ctx => `${pageHead(ctx, { crumbs: [[title]], eyebrow, title, lead })}
<section class="section"><div class="wrap legal">${approved ? '' : draftBanner}${body()}</div></section>`,
});

export default enabled ? [
  make('/privacy/', 'Политика обработки персональных данных', 'Документы', privacyHtml, 'Как мы обрабатываем и защищаем персональные данные посетителей сайта и заявок на коммерческое предложение.'),
  make('/consent/', 'Согласие на обработку персональных данных', 'Документы', consentHtml, 'Текст согласия, которое вы даёте, отмечая галочку в форме коммерческого предложения.'),
] : [];
