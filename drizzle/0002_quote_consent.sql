-- Отметка о согласии на обработку персональных данных (этап 1, 152-ФЗ). Только добавление пустых столбцов:
-- существующие заявки не меняются, прежняя версия приложения такие столбцы просто не использует (откат безопасен).
ALTER TABLE `quotes` ADD `consent_at` integer;
--> statement-breakpoint
ALTER TABLE `quotes` ADD `consent_version` text;
