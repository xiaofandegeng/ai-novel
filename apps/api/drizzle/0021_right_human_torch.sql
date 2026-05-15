CREATE TABLE "chapter_change_set_items" (
	"id" text PRIMARY KEY NOT NULL,
	"change_set_id" text NOT NULL,
	"project_id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"item_type" text NOT NULL,
	"risk_level" text DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"apply_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapter_change_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"scene_id" text,
	"writing_job_id" text,
	"source_step_id" text,
	"status" text DEFAULT 'drafted' NOT NULL,
	"risk_level" text DEFAULT 'medium' NOT NULL,
	"risk_summary" text,
	"draft_title" text,
	"draft_content" text,
	"consistency_report_json" jsonb,
	"extracted_changes_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"apply_report_json" jsonb,
	"before_snapshot_id" text,
	"after_snapshot_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"applied_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "writing_job_steps" ADD COLUMN "change_set_id" text;--> statement-breakpoint
ALTER TABLE "chapter_change_set_items" ADD CONSTRAINT "chapter_change_set_items_change_set_id_chapter_change_sets_id_fk" FOREIGN KEY ("change_set_id") REFERENCES "public"."chapter_change_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_change_set_items" ADD CONSTRAINT "chapter_change_set_items_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_change_set_items" ADD CONSTRAINT "chapter_change_set_items_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_change_sets" ADD CONSTRAINT "chapter_change_sets_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_change_sets" ADD CONSTRAINT "chapter_change_sets_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_change_sets" ADD CONSTRAINT "chapter_change_sets_scene_id_chapter_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."chapter_scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_change_sets" ADD CONSTRAINT "chapter_change_sets_writing_job_id_writing_jobs_id_fk" FOREIGN KEY ("writing_job_id") REFERENCES "public"."writing_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_change_sets" ADD CONSTRAINT "chapter_change_sets_source_step_id_writing_job_steps_id_fk" FOREIGN KEY ("source_step_id") REFERENCES "public"."writing_job_steps"("id") ON DELETE set null ON UPDATE no action;