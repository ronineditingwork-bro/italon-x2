// /consent/ — согласия на обработку персональных данных отдельными документами (по одному на цель формы). Формы ссылаются на якоря #quote, #salon, #outdoor.
// Тексты берутся из src/legal.mjs; при их изменении нужно поднять CONSENT_VERSION.
import { esc } from '../shared/format.mjs';
import { pageHead } from '../shared/blocks.mjs';
import { salon } from '../data.mjs';
import { company, PURPOSES, CONSENT_VERSION, POLICY_DATE } from '../../src/legal.mjs';

const doc = (ctx, p) => `<section class="pp__sec pp__doc" id="${p.anchor}"><h2>Согласие: ${esc(p.title)}</h2>
<p>Я, пользователь сайта ${esc(company.site)}, отметкой в форме свободно, своей волей и в своём интересе даю согласие оператору — ${esc(company.name)}, ИНН ${esc(company.inn)}${company.ogrn ? `, ОГРН ${esc(company.ogrn)}` : ''}${company.legalAddress ? `, адрес: ${esc(company.legalAddress)}` : ''}; адрес для обращений: салон ${esc(company.brand)}, ${esc(salon.address)}; ${esc(salon.email)}, ${esc(salon.phone)} — на обработку моих персональных данных на следующих условиях.</p>
<dl class="pp__dl">
<dt>Цель</dt><dd>${esc(p.goal)}.</dd>
<dt>Какие данные</dt><dd><ul>${p.data.map(d => `<li>${esc(d)}</li>`).join('')}</ul></dd>
<dt>Действия с данными</dt><dd>Сбор, запись, систематизация, хранение, уточнение, использование, передача менеджерам салона (в том числе сообщением в рабочий чат Telegram), удаление.</dd>
<dt>Где окажутся данные</dt><dd>${esc(p.storage)}</dd>
<dt>Срок</dt><dd>До достижения цели обработки либо до отзыва согласия, в зависимости от того, что наступит раньше.</dd>
<dt>Как отозвать</dt><dd>Письмом на ${esc(salon.email)} с указанием телефона или имени в Telegram из формы; отзыв можно подать в любое время. После отзыва обработка прекращается, а данные удаляются, если закон не требует хранить их дальше.</dd>
</dl>
<p>Согласие по этой цели не зависит от других и не распространяется на рассылки. Порядок обработки и защиты данных — в <a href="${ctx.url('/privacy/')}">Политике обработки персональных данных</a>.</p></section>`;
export default {
  path: '/consent/',
  name: 'consent',
  title: 'Согласие на обработку персональных данных',
  description: 'Тексты согласий на обработку персональных данных для форм сайта: коммерческое предложение, запись в салон, проект из Outdoor Lab.',
  styles: ['privacy'],
  render: ctx => `${pageHead(ctx, { crumbs: [['Согласие на обработку данных', null]], eyebrow: `Редакция ${esc(CONSENT_VERSION)} · политика от ${POLICY_DATE}`, title: 'Согласие на обработку персональных данных', lead: 'Отдельный документ для каждой формы. Вы даёте только то согласие, которое отметили в нужной форме.' })}
<div class="wrap pp">
${Object.values(PURPOSES).map(p => doc(ctx, p)).join('\n')}
</div>`,
};
