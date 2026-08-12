ALTER TABLE "foreshadowing_characters" DROP CONSTRAINT "foreshadowing_characters_character_id_characters_id_fk";
--> statement-breakpoint
ALTER TABLE "foreshadowing_items" DROP CONSTRAINT "foreshadowing_items_setup_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "foreshadowing_items" DROP CONSTRAINT "foreshadowing_items_expected_payoff_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "foreshadowing_items" DROP CONSTRAINT "foreshadowing_items_payoff_chapter_id_chapters_id_fk";
