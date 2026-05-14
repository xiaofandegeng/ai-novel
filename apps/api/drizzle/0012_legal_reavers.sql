CREATE TABLE "persona_memory_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"persona_id" text,
	"card_type" text NOT NULL,
	"content" text NOT NULL,
	"tags" text,
	"embedding_id" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foreshadowing_characters" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"foreshadowing_id" text NOT NULL,
	"character_id" text NOT NULL,
	"relation_type" text DEFAULT 'related' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conflict_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"conflict_id" text NOT NULL,
	"character_id" text NOT NULL,
	"role_in_conflict" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ALTER COLUMN "source_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ADD COLUMN "chunk_id" text;--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ADD COLUMN "embedding_model" text NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ADD COLUMN "embedding_vector" vector(1536);--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ADD COLUMN "content_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ADD COLUMN "content_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ADD COLUMN "updated_at" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "persona_memory_cards" ADD CONSTRAINT "persona_memory_cards_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_memory_cards" ADD CONSTRAINT "persona_memory_cards_persona_id_writing_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."writing_personas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreshadowing_characters" ADD CONSTRAINT "foreshadowing_characters_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreshadowing_characters" ADD CONSTRAINT "foreshadowing_characters_foreshadowing_id_foreshadowing_items_id_fk" FOREIGN KEY ("foreshadowing_id") REFERENCES "public"."foreshadowing_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreshadowing_characters" ADD CONSTRAINT "foreshadowing_characters_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_participants" ADD CONSTRAINT "conflict_participants_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_participants" ADD CONSTRAINT "conflict_participants_conflict_id_conflicts_id_fk" FOREIGN KEY ("conflict_id") REFERENCES "public"."conflicts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_participants" ADD CONSTRAINT "conflict_participants_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "foreshadowing_characters_unique" ON "foreshadowing_characters" USING btree ("project_id","foreshadowing_id","character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conflict_participants_unique" ON "conflict_participants" USING btree ("project_id","conflict_id","character_id");--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" DROP COLUMN "source_type";--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" DROP COLUMN "summary";--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" DROP COLUMN "tags";