CREATE TABLE "reference_chapter_analysis_errors" (
	"id" text PRIMARY KEY NOT NULL,
	"chapter_id" text NOT NULL,
	"work_id" text NOT NULL,
	"training_set_id" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reference_chapter_analysis_errors" ADD CONSTRAINT "reference_chapter_analysis_errors_chapter_id_reference_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."reference_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_chapter_analysis_errors" ADD CONSTRAINT "reference_chapter_analysis_errors_work_id_reference_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."reference_works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_chapter_analysis_errors" ADD CONSTRAINT "reference_chapter_analysis_errors_training_set_id_reference_training_sets_id_fk" FOREIGN KEY ("training_set_id") REFERENCES "public"."reference_training_sets"("id") ON DELETE cascade ON UPDATE no action;