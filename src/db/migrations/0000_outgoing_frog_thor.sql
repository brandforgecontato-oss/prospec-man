CREATE TABLE `ai_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lead_id` integer,
	`model` text NOT NULL,
	`purpose` text NOT NULL,
	`prompt_tokens` integer NOT NULL,
	`completion_tokens` integer NOT NULL,
	`cost_usd_micros` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ai_calls_lead_id_idx` ON `ai_calls` (`lead_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lead_id` integer,
	`type` text NOT NULL,
	`payload` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_lead_id_idx` ON `events` (`lead_id`);--> statement-breakpoint
CREATE TABLE `experiment_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`experiment_id` integer NOT NULL,
	`lead_id` integer NOT NULL,
	`variant` text NOT NULL,
	`is_control` integer DEFAULT false NOT NULL,
	`assigned_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `experiment_assignments_unique` ON `experiment_assignments` (`experiment_id`,`lead_id`);--> statement-breakpoint
CREATE TABLE `experiments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`variable` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`idempotency_key` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload` text NOT NULL,
	`lead_id` integer,
	`scheduled_for` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_idempotency_key_unique` ON `jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `jobs_status_scheduled_for_idx` ON `jobs` (`status`,`scheduled_for`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instagram_username` text NOT NULL,
	`instagram_user_id` text,
	`full_name` text,
	`bio` text,
	`profile_category` text,
	`is_private` integer DEFAULT false NOT NULL,
	`follower_count` integer,
	`discovered_via` text,
	`icp_score` integer,
	`decision_maker_type` text DEFAULT 'unknown' NOT NULL,
	`pipeline_stage` text DEFAULT 'discovered' NOT NULL,
	`channel_state` text DEFAULT 'browser_contact_pending' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`do_not_contact` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leads_instagram_username_unique` ON `leads` (`instagram_username`);--> statement-breakpoint
CREATE UNIQUE INDEX `leads_instagram_user_id_unique` ON `leads` (`instagram_user_id`);--> statement-breakpoint
CREATE INDEX `leads_pipeline_stage_idx` ON `leads` (`pipeline_stage`);--> statement-breakpoint
CREATE INDEX `leads_channel_state_idx` ON `leads` (`channel_state`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lead_id` integer NOT NULL,
	`direction` text NOT NULL,
	`channel` text NOT NULL,
	`content` text NOT NULL,
	`variant` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`provider_message_id` text,
	`sent_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_provider_message_id_unique` ON `messages` (`provider_message_id`);--> statement-breakpoint
CREATE INDEX `messages_lead_id_idx` ON `messages` (`lead_id`);