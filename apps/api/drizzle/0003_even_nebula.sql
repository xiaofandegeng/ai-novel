CREATE TABLE "chapter_memories" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"summary" text,
	"key_events" text,
	"new_facts" text,
	"character_state_changes" text,
	"relationship_changes" text,
	"conflict_progress" text,
	"foreshadowing_added" text,
	"foreshadowing_resolved" text,
	"theme_progress" text,
	"style_notes" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chapter_memories" ADD CONSTRAINT "chapter_memories_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_memories" ADD CONSTRAINT "chapter_memories_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;