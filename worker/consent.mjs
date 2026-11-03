// Подтверждение согласия на сервере: форма принимается только с текущей версией текста согласия; факт согласия записывается в таблицу consents.
import { CONSENT_VERSION, POLICY_VERSION, isCurrentConsent } from '../src/legal.mjs';

const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
export const contactHash = async contact => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(contact).trim().toLowerCase())));

export const CONSENT_ERROR = 'Нужно согласие на обработку персональных данных. Обновите страницу и отметьте его в форме.';
export const hasConsent = (consent, version) => isCurrentConsent(consent, version);

/** Записывает подтверждение. Если в окружении есть база и запись не удалась, бросает ошибку: без подтверждения данные дальше не идут. */
export async function recordConsent(env, purpose, contact, now = Date.now()) {
  if (!env?.DB) return false;                       // база не подключена (проверки без неё) — запись невозможна
  await env.DB.prepare('INSERT INTO consents (created_at, purpose, consent_version, policy_version, contact_hash) VALUES (?, ?, ?, ?, ?)')
    .bind(now, purpose, CONSENT_VERSION, POLICY_VERSION, await contactHash(contact)).run();
  return true;
}
/** Строка для сообщения менеджеру: когда и по какой редакции получено согласие. */
export const consentLine = (now = Date.now()) => `Согласие на обработку ПДн: получено ${new Date(now).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК), редакция ${CONSENT_VERSION}.`;
