CREATE TABLE "project_prompt_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"template_key" text NOT NULL,
	"override_system_prompt" text,
	"override_user_prompt_template" text,
	"enabled" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_templates" ALTER COLUMN "task_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_templates" ALTER COLUMN "content" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "system_prompt" text;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "user_prompt_template" text;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "output_schema" jsonb;--> statement-breakpoint
ALTER TABLE "story_structure_templates" ADD COLUMN "beats_json" text;--> statement-breakpoint
ALTER TABLE "story_structure_templates" ADD COLUMN "conflict_curve_json" text;--> statement-breakpoint
ALTER TABLE "project_prompt_overrides" ADD CONSTRAINT "project_prompt_overrides_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_key_unique" UNIQUE("key");