ALTER TABLE `experiments` ADD `variants` text NOT NULL;--> statement-breakpoint
ALTER TABLE `experiments` ADD `min_sample_size` integer DEFAULT 30 NOT NULL;