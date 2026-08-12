CREATE TABLE "credential_vault_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"kind" text NOT NULL,
	"ciphertext" text NOT NULL,
	"initialization_vector" text NOT NULL,
	"authentication_tag" text NOT NULL,
	"key_version" integer NOT NULL,
	"masked_suffix" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "credential_vault_project_kind_idx" ON "credential_vault_entries" USING btree ("project_id","kind");