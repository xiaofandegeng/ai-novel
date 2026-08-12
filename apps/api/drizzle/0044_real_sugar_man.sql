CREATE TABLE "project_data_keys" (
	"project_id" text PRIMARY KEY NOT NULL,
	"wrapped_key" jsonb,
	"key_version" integer NOT NULL,
	"algorithm" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"destroyed_at" timestamp with time zone,
	CONSTRAINT "project_data_keys_active_or_destroyed_check" CHECK (("project_data_keys"."wrapped_key" is not null and "project_data_keys"."destroyed_at" is null)
      or ("project_data_keys"."wrapped_key" is null and "project_data_keys"."destroyed_at" is not null))
);
