CREATE TABLE "project_read_models" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"genre" text,
	"theme" text,
	"target_words" integer,
	"target_audience" text,
	"style_profile" text,
	"status" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
