CREATE TABLE "aggregate_snapshots" (
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"project_id" text,
	"aggregate_version" integer NOT NULL,
	"schema_version" integer NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "aggregate_snapshots_aggregate_type_aggregate_id_pk" PRIMARY KEY("aggregate_type","aggregate_id")
);
--> statement-breakpoint
CREATE TABLE "aggregate_streams" (
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"project_id" text,
	"current_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "aggregate_streams_aggregate_type_aggregate_id_pk" PRIMARY KEY("aggregate_type","aggregate_id")
);
--> statement-breakpoint
CREATE TABLE "command_receipts" (
	"command_id" text PRIMARY KEY NOT NULL,
	"command_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"project_id" text,
	"status" text NOT NULL,
	"result" jsonb,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_events" (
	"global_position" bigserial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"aggregate_version" integer NOT NULL,
	"project_id" text,
	"event_type" text NOT NULL,
	"schema_version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"metadata" jsonb NOT NULL,
	"command_id" text NOT NULL,
	"event_index" integer NOT NULL,
	"correlation_id" text NOT NULL,
	"causation_id" text,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"handler_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projection_checkpoints" (
	"projection_name" text PRIMARY KEY NOT NULL,
	"last_global_position" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "aggregate_streams_project_idx" ON "aggregate_streams" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "command_receipts_aggregate_idx" ON "command_receipts" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_events_event_id_unique" ON "domain_events" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_events_stream_version_unique" ON "domain_events" USING btree ("aggregate_type","aggregate_id","aggregate_version");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_events_command_index_unique" ON "domain_events" USING btree ("command_id","event_index");--> statement-breakpoint
CREATE INDEX "domain_events_project_position_idx" ON "domain_events" USING btree ("project_id","global_position");--> statement-breakpoint
CREATE INDEX "domain_events_type_position_idx" ON "domain_events" USING btree ("event_type","global_position");--> statement-breakpoint
CREATE INDEX "event_outbox_available_idx" ON "event_outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "event_outbox_event_idx" ON "event_outbox" USING btree ("event_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_domain_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'domain_events is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER domain_events_append_only
BEFORE UPDATE OR DELETE ON "domain_events"
FOR EACH ROW
EXECUTE FUNCTION prevent_domain_events_mutation();
