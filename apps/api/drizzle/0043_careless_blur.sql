ALTER TABLE "chapter_postprocess_runs" ADD COLUMN "autonomous_run_id" text;--> statement-breakpoint
ALTER TABLE "chapter_postprocess_runs" ADD COLUMN "writing_job_id" text;--> statement-breakpoint
ALTER TABLE "chapter_postprocess_suggestions" ADD COLUMN "autonomous_run_id" text;--> statement-breakpoint
ALTER TABLE "chapter_postprocess_suggestions" ADD COLUMN "writing_job_id" text;