ALTER TABLE "chapter_postprocess_runs" DROP CONSTRAINT "chapter_postprocess_runs_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "chapter_style_fingerprints" DROP CONSTRAINT "chapter_style_fingerprints_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "chapter_postprocess_suggestions" DROP CONSTRAINT "chapter_postprocess_suggestions_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "chapter_postprocess_suggestions" DROP CONSTRAINT "chapter_postprocess_suggestions_run_id_chapter_postprocess_runs_id_fk";
