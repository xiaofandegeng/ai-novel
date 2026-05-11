ALTER TABLE "writing_jobs" ADD COLUMN "scene_id" text;--> statement-breakpoint
ALTER TABLE "chapter_scenes" ADD COLUMN "status" text DEFAULT 'planned' NOT NULL;--> statement-breakpoint
ALTER TABLE "chapter_scenes" ADD COLUMN "conflict" text;--> statement-breakpoint
ALTER TABLE "writing_jobs" ADD CONSTRAINT "writing_jobs_scene_id_chapter_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."chapter_scenes"("id") ON DELETE set null ON UPDATE no action;