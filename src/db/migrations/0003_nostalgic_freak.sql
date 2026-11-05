CREATE TABLE `system_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`paused` integer DEFAULT false NOT NULL,
	`paused_reason` text,
	`paused_at` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
