CREATE TABLE `chapter_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`chapter_id` text NOT NULL,
	`content` text NOT NULL,
	`word_count` integer NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `novel_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chapters` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`volume_id` text,
	`title` text NOT NULL,
	`chapter_number` integer NOT NULL,
	`outline` text,
	`summary` text,
	`characters` text,
	`goals` text,
	`conflicts` text,
	`events` text,
	`emotional_arc` text,
	`foreshadowing` text,
	`ending_hook` text,
	`draft` text,
	`status` text DEFAULT 'not_started' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `novel_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`volume_id`) REFERENCES `volumes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `character_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`character_a_id` text NOT NULL,
	`character_b_id` text NOT NULL,
	`type` text NOT NULL,
	`strength` integer DEFAULT 1 NOT NULL,
	`status` text,
	`description` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `novel_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_a_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_b_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`goal` text,
	`fear` text,
	`secret` text,
	`desire` text,
	`weakness` text,
	`personality` text,
	`arc` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `novel_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`intensity` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'latent' NOT NULL,
	`participants` text,
	`description` text,
	`resolution` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `novel_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `knowledge_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`project_id` text NOT NULL,
	`chunk_type` text NOT NULL,
	`title` text,
	`content` text NOT NULL,
	`summary` text,
	`techniques` text,
	`order_index` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `knowledge_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `novel_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `knowledge_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`tags` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `knowledge_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `novel_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `knowledge_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`source_type` text NOT NULL,
	`file_name` text,
	`file_size` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `novel_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `novel_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`genre` text,
	`theme` text,
	`target_words` integer,
	`target_audience` text,
	`style_profile` text,
	`status` text DEFAULT 'planning' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quality_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`chapter_id` text,
	`scope` text NOT NULL,
	`score` integer NOT NULL,
	`rhythm_score` integer,
	`conflict_score` integer,
	`logic_score` integer,
	`character_score` integer,
	`style_score` integer,
	`issues` text,
	`suggestions` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `novel_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `story_bibles` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`worldview` text,
	`main_conflict` text,
	`theme` text,
	`rules` text,
	`timeline` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `novel_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `volumes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`order_index` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `novel_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
