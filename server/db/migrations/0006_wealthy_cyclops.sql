CREATE TABLE "app_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_entity_type" text NOT NULL,
	"owner_entity_id" uuid NOT NULL,
	"file_kind" text DEFAULT 'attachment' NOT NULL,
	"source_file_id" uuid,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"sha256_hash" text NOT NULL,
	"width" integer,
	"height" integer,
	"binary_data" "bytea" NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app_files" ADD CONSTRAINT "app_files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_files_owner_idx" ON "app_files" USING btree ("owner_entity_type","owner_entity_id");--> statement-breakpoint
CREATE INDEX "app_files_kind_idx" ON "app_files" USING btree ("file_kind");--> statement-breakpoint
CREATE INDEX "app_files_source_idx" ON "app_files" USING btree ("source_file_id");--> statement-breakpoint
CREATE INDEX "app_files_archived_idx" ON "app_files" USING btree ("archived_at");