CREATE TABLE "autonomous_run_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"project_id" text NOT NULL,
	"writing_job_id" text NOT NULL,
	"chapter_id" text,
	"scene_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"order_index" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autonomous_writing_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"strategy" text DEFAULT 'balanced' NOT NULL,
	"scope_type" text NOT NULL,
	"volume_id" text,
	"start_chapter_id" text,
	"end_chapter_id" text,
	"target_chapter_count" integer,
	"target_words_per_chapter" integer DEFAULT 3000 NOT NULL,
	"current_chapter_id" text,
	"completed_chapter_count" integer DEFAULT 0 NOT NULL,
	"failed_chapter_count" integer DEFAULT 0 NOT NULL,
	"paused_reason" text,
	"last_error" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autonomous_run_exceptions" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"project_id" text NOT NULL,
	"chapter_id" text,
	"change_set_id" text,
	"exception_type" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "writing_jobs" ADD COLUMN "autonomous_run_id" text;--> statement-breakpoint
ALTER TABLE "autonomous_run_jobs" ADD CONSTRAINT "autonomous_run_jobs_run_id_autonomous_writing_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."autonomous_writing_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomous_run_jobs" ADD CONSTRAINT "autonomous_run_jobs_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomous_run_jobs" ADD CONSTRAINT "autonomous_run_jobs_writing_job_id_writing_jobs_id_fk" FOREIGN KEY ("writing_job_id") REFERENCES "public"."writing_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomous_run_jobs" ADD CONSTRAINT "autonomous_run_jobs_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomous_run_jobs" ADD CONSTRAINT "autonomous_run_jobs_scene_id_chapter_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."chapter_scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomous_writing_runs" ADD CONSTRAINT "autonomous_writing_runs_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomous_run_exceptions" ADD CONSTRAINT "autonomous_run_exceptions_run_id_autonomous_writing_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."autonomous_writing_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomous_run_exceptions" ADD CONSTRAINT "autonomous_run_exceptions_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomous_run_exceptions" ADD CONSTRAINT "autonomous_run_exceptions_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomous_run_exceptions" ADD CONSTRAINT "autonomous_run_exceptions_change_set_id_chapter_change_sets_id_fk" FOREIGN KEY ("change_set_id") REFERENCES "public"."chapter_change_sets"("id") ON DELETE set null ON UPDATE no action;