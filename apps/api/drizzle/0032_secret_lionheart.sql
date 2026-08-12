ALTER TABLE "conflict_timeline_events" DROP CONSTRAINT "conflict_timeline_events_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "conflict_timeline_events" DROP CONSTRAINT "conflict_timeline_events_scene_id_chapter_scenes_id_fk";
--> statement-breakpoint
ALTER TABLE "conflict_participants" DROP CONSTRAINT "conflict_participants_character_id_characters_id_fk";
