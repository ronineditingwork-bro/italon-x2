CREATE TABLE `carts` (
	`id` text PRIMARY KEY NOT NULL,
	`items` text DEFAULT '[]' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
