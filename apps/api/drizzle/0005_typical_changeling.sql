CREATE TABLE "acts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"volume_id" text,
	"title" text NOT NULL,
	"description" text,
	"theme" text,
	"key_events" text,
	"target_chapter_count" integer,
	"order_index" integer NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapter_elements" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"element_type" text NOT NULL,
	"element_id" text,
	"element_name" text NOT NULL,
	"relation_type" text NOT NULL,
	"importance" text DEFAULT 'normal' NOT NULL,
	"appearance_order" integer,
	"notes" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapter_postprocess_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"trigger" text NOT NULL,
	"error_message" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapter_scenes" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"scene_number" integer NOT NULL,
	"title" text,
	"location" text,
	"timeline" text,
	"purpose" text,
	"summary" text,
	"characters" text,
	"target_words" integer,
	"content" text,
	"order_index" integer NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foreshadowing_items" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"setup_chapter_id" text,
	"expected_payoff_chapter_id" text,
	"payoff_chapter_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"importance" text DEFAULT 'normal' NOT NULL,
	"related_characters" text,
	"related_events" text,
	"notes" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_fact_triples" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_name" text NOT NULL,
	"predicate" text NOT NULL,
	"object_type" text NOT NULL,
	"object_name" text NOT NULL,
	"confidence" integer DEFAULT 70 NOT NULL,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"source_chapter_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"related_chapters" text,
	"notes" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"current_chapter_id" text,
	"mode" text NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"last_error" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acts" ADD CONSTRAINT "acts_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acts" ADD CONSTRAINT "acts_volume_id_volumes_id_fk" FOREIGN KEY ("volume_id") REFERENCES "public"."volumes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_elements" ADD CONSTRAINT "chapter_elements_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_elements" ADD CONSTRAINT "chapter_elements_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_postprocess_runs" ADD CONSTRAINT "chapter_postprocess_runs_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_postprocess_runs" ADD CONSTRAINT "chapter_postprocess_runs_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_scenes" ADD CONSTRAINT "chapter_scenes_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_scenes" ADD CONSTRAINT "chapter_scenes_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreshadowing_items" ADD CONSTRAINT "foreshadowing_items_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreshadowing_items" ADD CONSTRAINT "foreshadowing_items_setup_chapter_id_chapters_id_fk" FOREIGN KEY ("setup_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreshadowing_items" ADD CONSTRAINT "foreshadowing_items_expected_payoff_chapter_id_chapters_id_fk" FOREIGN KEY ("expected_payoff_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreshadowing_items" ADD CONSTRAINT "foreshadowing_items_payoff_chapter_id_chapters_id_fk" FOREIGN KEY ("payoff_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_fact_triples" ADD CONSTRAINT "story_fact_triples_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_fact_triples" ADD CONSTRAINT "story_fact_triples_source_chapter_id_chapters_id_fk" FOREIGN KEY ("source_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_jobs" ADD CONSTRAINT "writing_jobs_project_id_novel_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."novel_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_jobs" ADD CONSTRAINT "writing_jobs_current_chapter_id_chapters_id_fk" FOREIGN KEY ("current_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chapter_elements_unique" ON "chapter_elements" USING btree ("project_id","chapter_id","element_type","element_name","relation_type");--> statement-breakpoint
CREATE UNIQUE INDEX "story_fact_triples_unique" ON "story_fact_triples" USING btree ("project_id","subject_type","subject_name","predicate","object_type","object_name");