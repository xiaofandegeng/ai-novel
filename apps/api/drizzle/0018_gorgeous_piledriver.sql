ALTER TABLE "ai_settings" ADD COLUMN "embedding_provider" text;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "embedding_base_url" text;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "embedding_api_key" text;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "embedding_enabled" boolean DEFAULT true;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_embeddings_content_unique" ON "knowledge_embeddings" USING btree ("project_id","embedding_model","content_type","content_hash");