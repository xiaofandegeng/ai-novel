ALTER TABLE "chapter_style_fingerprints" ADD COLUMN "scene_id" text;--> statement-breakpoint
ALTER TABLE "chapter_style_fingerprints" ADD COLUMN "scope" text DEFAULT 'chapter' NOT NULL;