ALTER TABLE "knowledge_chunks" ADD COLUMN "importance" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD COLUMN "last_retrieved_at" integer;