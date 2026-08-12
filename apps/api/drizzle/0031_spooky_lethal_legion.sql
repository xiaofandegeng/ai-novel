ALTER TABLE "character_arc_events" DROP CONSTRAINT "character_arc_events_character_id_characters_id_fk";
--> statement-breakpoint
ALTER TABLE "character_arc_events" DROP CONSTRAINT "character_arc_events_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "character_arc_events" DROP CONSTRAINT "character_arc_events_scene_id_chapter_scenes_id_fk";
--> statement-breakpoint
ALTER TABLE "character_relationships" DROP CONSTRAINT "character_relationships_character_a_id_characters_id_fk";
--> statement-breakpoint
ALTER TABLE "character_relationships" DROP CONSTRAINT "character_relationships_character_b_id_characters_id_fk";
