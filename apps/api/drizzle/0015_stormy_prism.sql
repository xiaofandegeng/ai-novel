CREATE TABLE "chapter_style_fingerprints" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"sentence_length_avg" integer,
	"dialogue_ratio" integer,
	"emotion_density" integer,
	"conflict_density" integer,
	"hook_density" integer,
	"style_summary" text,
	"embedding_id" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_health_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"scope" text NOT NULL,
	"score" integer NOT NULL,
	"risk_level" text NOT NULL,
	"metrics_json" jsonb,
	"generated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chapter_style_fingerprints" ADD CONSTRAINT "chapter_style_fingerprints_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_style_fingerprints" ADD CONSTRAINT "chapter_style_fingerprints_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_health_reports" ADD CONSTRAINT "project_health_reports_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;