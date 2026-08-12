CREATE TABLE "project_ai_settings" (
	"project_id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"base_url" text NOT NULL,
	"model" text NOT NULL,
	"temperature" integer NOT NULL,
	"credential_ref" text,
	"credential_suffix" text,
	"embedding_provider" text NOT NULL,
	"embedding_base_url" text NOT NULL,
	"embedding_model" text NOT NULL,
	"embedding_credential_ref" text,
	"embedding_credential_suffix" text,
	"embedding_enabled" boolean NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
