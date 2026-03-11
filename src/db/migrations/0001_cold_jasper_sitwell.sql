CREATE TABLE `community_idea_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`idea_id` text NOT NULL,
	`voter_id` text NOT NULL,
	`value` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`idea_id`) REFERENCES `community_ideas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_idea_votes_idea_voter_unique` ON `community_idea_votes` (`idea_id`,`voter_id`);--> statement-breakpoint
CREATE TABLE `community_ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`format` text NOT NULL,
	`rationale` text,
	`source` text DEFAULT 'agent' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `community_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
