-- X2 Outdoor Lab: проекты посетителей. Только новые таблицы: корзины и заявки не затрагиваются, миграция обратима (DROP TABLE выше перечисленных).
-- Персональные данные (телефон, адрес, фото) хранятся здесь и в закрытом каталоге на сервере; наружу их отдаёт только вход по SMS-коду (владелец) или токен менеджера.
CREATE TABLE `outdoor_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`address_status` text NOT NULL,
	`address_json` text DEFAULT '{}' NOT NULL,
	`state_json` text NOT NULL,
	`has_photo` integer DEFAULT 0 NOT NULL,
	`has_result` integer DEFAULT 0 NOT NULL,
	`photo_consent` integer DEFAULT 0 NOT NULL,
	`pd_consent_at` integer NOT NULL,
	`marketing_consent` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_view_at` integer,
	`lead_sent_at` integer,
	`deleted_at` integer
);
CREATE INDEX `outdoor_projects_phone` ON `outdoor_projects` (`phone`);
CREATE TABLE `outdoor_otp` (
	`phone` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`used_at` integer
);
CREATE INDEX `outdoor_otp_phone` ON `outdoor_otp` (`phone`, `created_at`);
CREATE TABLE `outdoor_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
CREATE TABLE `outdoor_shares` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`share_id` text NOT NULL,
	`project_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`views` integer DEFAULT 0 NOT NULL,
	`last_view_at` integer
);
CREATE INDEX `outdoor_shares_project` ON `outdoor_shares` (`project_id`);
CREATE TABLE `outdoor_history` (
	`project_id` text NOT NULL,
	`at` integer NOT NULL,
	`event` text NOT NULL,
	`data` text DEFAULT '' NOT NULL
);
CREATE INDEX `outdoor_history_project` ON `outdoor_history` (`project_id`, `at`);
