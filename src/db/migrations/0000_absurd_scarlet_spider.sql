CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`platform` text NOT NULL,
	`chat_type` text NOT NULL,
	`summary` text,
	`last_message_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`type` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`proposed_by` text NOT NULL,
	`date` text NOT NULL,
	`location` text,
	`max_capacity` integer,
	`min_capacity` integer,
	`budget` text,
	`score` real,
	`score_breakdown` text,
	`agent_notes` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`rating` integer NOT NULL,
	`text` text,
	`collected_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `import_log` (
	`id` text PRIMARY KEY NOT NULL,
	`source_file` text NOT NULL,
	`type` text NOT NULL,
	`messages_processed` integer DEFAULT 0,
	`members_processed` integer DEFAULT 0,
	`entries_extracted` integer DEFAULT 0,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `research` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`event_type` text,
	`data` text NOT NULL,
	`source` text,
	`researched_at` text NOT NULL,
	`expires_at` text
);
--> statement-breakpoint
CREATE TABLE `rsvps` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`responded_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_memory` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`telegram_id` text,
	`whatsapp_id` text,
	`name` text NOT NULL,
	`preferred_name` text,
	`joined_at` text NOT NULL,
	`last_active_at` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_telegram_id_unique` ON `users` (`telegram_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_whatsapp_id_unique` ON `users` (`whatsapp_id`);