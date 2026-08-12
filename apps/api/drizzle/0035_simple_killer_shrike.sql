ALTER TABLE "authoring_events" DROP CONSTRAINT "authoring_events_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "story_fact_triples" DROP CONSTRAINT "story_fact_triples_source_chapter_id_chapters_id_fk";
