// Юридические тексты сайта (152-ФЗ). ВАЖНО: тексты в privacy.html и consent.html — ЧЕРНОВИКИ для проверки юристом.
// Они попадают на сайт только при сборке с PD_CONSENT=1; пока PD_LEGAL_APPROVED не равно 1, страницы помечены «ЧЕРНОВИК»
// и закрыты от индексации, а проверка scripts/verify-catalog.mjs не даёт выложить такую сборку как релиз (RELEASE_BUILD=1).
// Места, которые должен заполнить владелец или юрист, помечены [[двойными квадратными скобками]].
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const enabled = process.env.PD_CONSENT === '1';
export const approved = process.env.PD_LEGAL_APPROVED === '1';
/** Версия текстов; записывается в базу вместе с отметкой о согласии (CONSENT_VERSION на сервере). */
export const version = process.env.CONSENT_VERSION || (approved ? 'approved' : 'DRAFT');

// служебные комментарии для юриста (<!-- … -->) в готовую страницу не попадают
const read = name => readFileSync(resolve(import.meta.dirname, name), 'utf8').replace(/<!--[\s\S]*?-->\s*/g, '');
export const privacyHtml = () => read('privacy.html');
export const consentHtml = () => read('consent.html');

export const draftBanner = `<aside class="legal-draft" role="note"><strong>ЧЕРНОВИК.</strong> Текст подготовлен для проверки юристом и не является окончательной редакцией. Не публиковать без проверки.</aside>`;

/** Блок согласия в форме КП. Снимается галочка → КП скачивается, но заявка менеджеру не отправляется. */
export const formBlock = (privacyUrl, consentUrl) => `<div class="consent">
<label class="check consent__check"><input type="checkbox" id="quote-consent" name="consent" value="1"><span>Я даю <a href="${consentUrl}" target="_blank" rel="noopener">согласие на обработку персональных данных</a> и знаком(а) с <a href="${privacyUrl}" target="_blank" rel="noopener">политикой обработки персональных данных</a></span></label>
<p class="t-small consent__note">Без галочки КП скачается на ваше устройство, но заявка менеджеру салона отправлена не будет. С галочкой телефон и введённые данные получит менеджер [[НАИМЕНОВАНИЕ ОПЕРАТОРА]] (в том числе через мессенджер Telegram), чтобы связаться с вами.</p>
</div>`;
