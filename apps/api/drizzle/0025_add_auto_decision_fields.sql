ALTER TABLE "writing_job_steps" ADD COLUMN "auto_risk_level" text;--> statement-breakpoint
ALTER TABLE "writing_job_steps" ADD COLUMN "auto_decision_report" jsonb;--> statement-breakpoint
ALTER TABLE "writing_job_steps" DROP COLUMN "review_required";--> statement-breakpoint
ALTER TABLE "autonomous_run_jobs" ADD COLUMN "isolation_reason" text;--> statement-breakpoint
ALTER TABLE "autonomous_run_jobs" ADD COLUMN "isolation_report" jsonb;--> statement-breakpoint
ALTER TABLE "autonomous_run_exceptions" ADD COLUMN "auto_resolution_strategy" text;--> statement-breakpoint
ALTER TABLE "autonomous_run_exceptions" ADD COLUMN "resolution_report" jsonb;
