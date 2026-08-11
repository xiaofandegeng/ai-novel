ALTER TABLE "chapters" DROP CONSTRAINT "chapters_volume_id_volumes_id_fk";
--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_volume_id_volumes_id_fk" FOREIGN KEY ("volume_id") REFERENCES "public"."volumes"("id") ON DELETE set null ON UPDATE no action;