ALTER TABLE "autonomous_run_jobs" DROP CONSTRAINT "autonomous_run_jobs_writing_job_id_writing_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "autonomous_run_jobs" DROP CONSTRAINT "autonomous_run_jobs_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "autonomous_run_jobs" DROP CONSTRAINT "autonomous_run_jobs_scene_id_chapter_scenes_id_fk";
--> statement-breakpoint
ALTER TABLE "autonomous_run_exceptions" DROP CONSTRAINT "autonomous_run_exceptions_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "autonomous_run_exceptions" DROP CONSTRAINT "autonomous_run_exceptions_change_set_id_chapter_change_sets_id_fk";
--> statement-breakpoint
ALTER TABLE "autonomous_run_exceptions" DROP CONSTRAINT "autonomous_run_exceptions_writing_job_id_writing_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "autonomous_run_exceptions" DROP CONSTRAINT "autonomous_run_exceptions_step_id_writing_job_steps_id_fk";
