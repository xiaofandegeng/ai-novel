CREATE TABLE "chapter_analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"chapter_id" text NOT NULL,
	"work_id" text NOT NULL,
	"training_set_id" text NOT NULL,
	"opening_hook" text,
	"conflict_type" text,
	"pressure_source" text,
	"protagonist_action" text,
	"payoff_type" text,
	"cliffhanger" text,
	"emotion_curve" text,
	"pacing_score" integer,
	"dialogue_ratio" integer,
	"description_ratio" integer,
	"narrative_pattern" text,
	"trope_tags" text,
	"craft_notes" text,
	"risk_notes" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_persona_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"persona_id" text NOT NULL,
	"strength" integer DEFAULT 65 NOT NULL,
	"enabled_for_outline" integer DEFAULT 1 NOT NULL,
	"enabled_for_draft" integer DEFAULT 1 NOT NULL,
	"enabled_for_polish" integer DEFAULT 0 NOT NULL,
	"enabled_for_quality_review" integer DEFAULT 0 NOT NULL,
	"project_overrides" text,
	"disabled_rules" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_chapters" (
	"id" text PRIMARY KEY NOT NULL,
	"work_id" text NOT NULL,
	"training_set_id" text NOT NULL,
	"title" text NOT NULL,
	"chapter_number" integer NOT NULL,
	"content" text NOT NULL,
	"word_count" integer NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_training_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"genre" text,
	"target_persona_type" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_works" (
	"id" text PRIMARY KEY NOT NULL,
	"training_set_id" text NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"source_type" text DEFAULT 'webnovel' NOT NULL,
	"file_name" text,
	"file_size" integer,
	"word_count" integer,
	"chapter_count" integer,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_style_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"work_id" text NOT NULL,
	"training_set_id" text NOT NULL,
	"summary" text,
	"core_appeal" text,
	"pacing_model" text,
	"hook_model" text,
	"conflict_model" text,
	"character_model" text,
	"language_profile" text,
	"chapter_template" text,
	"strengths" text,
	"weaknesses" text,
	"avoid_copying" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_personas" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"genre" text,
	"source_training_set_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"core_appeal" text,
	"pacing_rules" text,
	"conflict_rules" text,
	"character_rules" text,
	"language_rules" text,
	"chapter_rules" text,
	"hook_rules" text,
	"forbidden_rules" text,
	"similarity_guardrails" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chapter_analyses" ADD CONSTRAINT "chapter_analyses_chapter_id_reference_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."reference_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_analyses" ADD CONSTRAINT "chapter_analyses_work_id_reference_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."reference_works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_analyses" ADD CONSTRAINT "chapter_analyses_training_set_id_reference_training_sets_id_fk" FOREIGN KEY ("training_set_id") REFERENCES "public"."reference_training_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_persona_configs" ADD CONSTRAINT "project_persona_configs_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_persona_configs" ADD CONSTRAINT "project_persona_configs_persona_id_writing_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."writing_personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_chapters" ADD CONSTRAINT "reference_chapters_work_id_reference_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."reference_works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_chapters" ADD CONSTRAINT "reference_chapters_training_set_id_reference_training_sets_id_fk" FOREIGN KEY ("training_set_id") REFERENCES "public"."reference_training_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_works" ADD CONSTRAINT "reference_works_training_set_id_reference_training_sets_id_fk" FOREIGN KEY ("training_set_id") REFERENCES "public"."reference_training_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_style_reports" ADD CONSTRAINT "work_style_reports_work_id_reference_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."reference_works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_style_reports" ADD CONSTRAINT "work_style_reports_training_set_id_reference_training_sets_id_fk" FOREIGN KEY ("training_set_id") REFERENCES "public"."reference_training_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_personas" ADD CONSTRAINT "writing_personas_source_training_set_id_reference_training_sets_id_fk" FOREIGN KEY ("source_training_set_id") REFERENCES "public"."reference_training_sets"("id") ON DELETE no action ON UPDATE no action;