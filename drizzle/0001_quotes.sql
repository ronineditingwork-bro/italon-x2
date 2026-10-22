CREATE TABLE `quotes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`customer` text DEFAULT '' NOT NULL,
	`phone` text NOT NULL,
	`project` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`items` text NOT NULL,
	`total_kopecks` integer NOT NULL,
	`telegram_ok` integer DEFAULT 0 NOT NULL
);
