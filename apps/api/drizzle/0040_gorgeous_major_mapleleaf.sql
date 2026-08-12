ALTER TABLE "ai_generation_candidates" DROP CONSTRAINT "ai_generation_candidates_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_context_snapshots" DROP CONSTRAINT "ai_context_snapshots_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_usage_records" DROP CONSTRAINT "ai_usage_records_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_usage_records" DROP CONSTRAINT "ai_usage_records_context_snapshot_id_ai_context_snapshots_id_fk";
--> statement-breakpoint
ALTER TABLE "prompt_template_runs" DROP CONSTRAINT "prompt_template_runs_context_snapshot_id_ai_context_snapshots_id_fk";
--> statement-breakpoint
ALTER TABLE "prompt_template_runs" DROP CONSTRAINT "prompt_template_runs_template_id_prompt_templates_id_fk";
