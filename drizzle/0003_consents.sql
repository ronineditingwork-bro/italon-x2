-- Подтверждения согласия на обработку персональных данных (формы КП, записи в салон, Outdoor Lab).
-- Контакт хранится только как SHA-256 нормализованного телефона или @telegram: по нему можно подтвердить согласие конкретного человека, не храня сам номер в этой таблице.
CREATE TABLE IF NOT EXISTS `consents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`purpose` text NOT NULL,
	`consent_version` text NOT NULL,
	`policy_version` text NOT NULL,
	`contact_hash` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `consents_contact_idx` ON `consents` (`contact_hash`);
