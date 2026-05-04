CREATE TABLE "ai_context_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"chapter_id" text,
	"scene" text,
	"request_id" text NOT NULL,
	"model_provider" text,
	"model_name" text,
	"context_payload" text,
	"rendered_prompt_preview" text,
	"token_estimate" integer,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapter_postprocess_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"run_id" text,
	"suggestion_type" text NOT NULL,
	"payload" text NOT NULL,
	"confidence" integer DEFAULT 70 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"embedding" text,
	"summary" text,
	"tags" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "persona_memory_fragments" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"fragment_type" text NOT NULL,
	"content" text NOT NULL,
	"confidence" integer DEFAULT 70 NOT NULL,
	"source_type" text DEFAULT 'ai_extracted' NOT NULL,
	"source_chapter_ids" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_applied_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"template_id" text NOT NULL,
	"applied_at" timestamp NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_structure_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"genre" text,
	"structure_type" text NOT NULL,
	"acts_json" text,
	"chapter_count_estimate" integer,
	"is_builtin" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_job_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"step_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input" text,
	"output" text,
	"error" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_context_snapshots" ADD CONSTRAINT "ai_context_snapshots_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_context_snapshots" ADD CONSTRAINT "ai_context_snapshots_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_postprocess_suggestions" ADD CONSTRAINT "chapter_postprocess_suggestions_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_postprocess_suggestions" ADD CONSTRAINT "chapter_postprocess_suggestions_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_postprocess_suggestions" ADD CONSTRAINT "chapter_postprocess_suggestions_run_id_chapter_postprocess_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."chapter_postprocess_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ADD CONSTRAINT "knowledge_embeddings_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_memory_fragments" ADD CONSTRAINT "persona_memory_fragments_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_applied_templates" ADD CONSTRAINT "project_applied_templates_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_applied_templates" ADD CONSTRAINT "project_applied_templates_template_id_story_structure_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."story_structure_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_job_steps" ADD CONSTRAINT "writing_job_steps_job_id_writing_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."writing_jobs"("id") ON DELETE cascade ON UPDATE no action;