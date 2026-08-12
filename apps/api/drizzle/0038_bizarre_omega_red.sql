ALTER TABLE "chapter_change_set_items" DROP CONSTRAINT "chapter_change_set_items_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "chapter_change_sets" DROP CONSTRAINT "chapter_change_sets_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "chapter_change_sets" DROP CONSTRAINT "chapter_change_sets_scene_id_chapter_scenes_id_fk";
--> statement-breakpoint
ALTER TABLE "chapter_change_sets" DROP CONSTRAINT "chapter_change_sets_writing_job_id_writing_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "chapter_change_sets" DROP CONSTRAINT "chapter_change_sets_source_step_id_writing_job_steps_id_fk";
