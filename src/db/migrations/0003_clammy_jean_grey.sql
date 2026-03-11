CREATE TABLE `cloud_publish_credentials` (
	`slug` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`community_name` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
