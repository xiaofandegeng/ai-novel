CREATE TABLE "ai_generation_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"chapter_id" text,
	"context_snapshot_id" text,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"task_type" text NOT NULL,
	"content" text NOT NULL,
	"quality_score" integer,
	"user_selected" integer DEFAULT 0 NOT NULL,
	"user_rating" integer,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_arc_events" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"character_id" text NOT NULL,
	"chapter_id" text,
	"scene_id" text,
	"event_type" text NOT NULL,
	"before_state" text,
	"after_state" text,
	"motivation_change" text,
	"relationship_impact" text,
	"evidence" text,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conflict_timeline_events" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"conflict_id" text NOT NULL,
	"chapter_id" text,
	"scene_id" text,
	"intensity_before" integer NOT NULL,
	"intensity_after" integer NOT NULL,
	"status_before" text NOT NULL,
	"status_after" text NOT NULL,
	"reason" text,
	"evidence" text,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_writing_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"date" text NOT NULL,
	"words_added" integer DEFAULT 0 NOT NULL,
	"chapters_completed" integer DEFAULT 0 NOT NULL,
	"ai_words_accepted" integer DEFAULT 0 NOT NULL,
	"manual_words_added" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"goal_type" text NOT NULL,
	"target_words" integer,
	"target_chapters" integer,
	"start_date" text NOT NULL,
	"end_date" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_quality_feedback" ALTER COLUMN "created_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ALTER COLUMN "created_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "authoring_events" ALTER COLUMN "created_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "prompt_template_runs" ALTER COLUMN "created_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "chapter_scenes" ADD COLUMN "beat_type" text;--> statement-breakpoint
ALTER TABLE "chapter_scenes" ADD COLUMN "entry_hook" text;--> statement-breakpoint
ALTER TABLE "chapter_scenes" ADD COLUMN "turning_point" text;--> statement-breakpoint
ALTER TABLE "chapter_scenes" ADD COLUMN "exit_hook" text;--> statement-breakpoint
ALTER TABLE "chapter_scenes" ADD COLUMN "emotion_start" text;--> statement-breakpoint
ALTER TABLE "chapter_scenes" ADD COLUMN "emotion_end" text;--> statement-breakpoint
ALTER TABLE "chapter_scenes" ADD COLUMN "conflict_level" integer;--> statement-breakpoint
ALTER TABLE "chapter_scenes" ADD COLUMN "required_elements" text;--> statement-breakpoint
ALTER TABLE "ai_generation_candidates" ADD CONSTRAINT "ai_generation_candidates_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_candidates" ADD CONSTRAINT "ai_generation_candidates_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_arc_events" ADD CONSTRAINT "character_arc_events_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_arc_events" ADD CONSTRAINT "character_arc_events_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_arc_events" ADD CONSTRAINT "character_arc_events_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_arc_events" ADD CONSTRAINT "character_arc_events_scene_id_chapter_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."chapter_scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_timeline_events" ADD CONSTRAINT "conflict_timeline_events_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_timeline_events" ADD CONSTRAINT "conflict_timeline_events_conflict_id_conflicts_id_fk" FOREIGN KEY ("conflict_id") REFERENCES "public"."conflicts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_timeline_events" ADD CONSTRAINT "conflict_timeline_events_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_timeline_events" ADD CONSTRAINT "conflict_timeline_events_scene_id_chapter_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."chapter_scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_writing_stats" ADD CONSTRAINT "daily_writing_stats_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_goals" ADD CONSTRAINT "writing_goals_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_writing_stats_project_date_unique" ON "daily_writing_stats" USING btree ("project_id","date");