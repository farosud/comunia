CREATE TABLE `product_ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`target_members` text,
	`rationale` text,
	`build_prompt` text NOT NULL,
	`source` text DEFAULT 'agent' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL
);
