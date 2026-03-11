CREATE TABLE `published_idea_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`idea_id` text NOT NULL,
	`voter_id` text NOT NULL,
	`value` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`slug`) REFERENCES `published_portals`(`slug`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `published_idea_votes_slug_idea_voter_unique` ON `published_idea_votes` (`slug`,`idea_id`,`voter_id`);--> statement-breakpoint
CREATE TABLE `published_portals` (
	`slug` text PRIMARY KEY NOT NULL,
	`community_name` text NOT NULL,
	`snapshot` text NOT NULL,
	`passcode` text NOT NULL,
	`bot_url` text,
	`published_at` text NOT NULL,
	`updated_at` text NOT NULL
);
