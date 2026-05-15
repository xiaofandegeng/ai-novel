ALTER TABLE "writing_job_steps" ADD COLUMN "review_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "writing_job_steps" ADD COLUMN "auto_decision" text;--> statement-breakpoint
ALTER TABLE "writing_job_steps" ADD COLUMN "auto_decision_reason" text;--> statement-breakpoint
ALTER TABLE "writing_jobs" ADD COLUMN "execution_mode" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "writing_jobs" ADD COLUMN "auto_approval_level" text DEFAULT 'conservative' NOT NULL;--> statement-breakpoint
ALTER TABLE "writing_jobs" ADD COLUMN "auto_stop_reason" text;--> statement-breakpoint
ALTER TABLE "writing_jobs" ADD COLUMN "auto_approved_steps" integer DEFAULT 0 NOT NULL;