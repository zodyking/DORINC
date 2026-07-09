CREATE TABLE "backup_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"schedule_cron" text,
	"retention_daily" integer DEFAULT 30 NOT NULL,
	"retention_weekly" integer DEFAULT 12 NOT NULL,
	"retention_monthly" integer DEFAULT 12 NOT NULL,
	"storage_mode" text DEFAULT 'database' NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backup_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"dump_bytes" bigint,
	"compressed_bytes" bigint,
	"encrypted_bytes" bigint NOT NULL,
	"sha256_checksum" text NOT NULL,
	"encrypted_payload" "bytea" NOT NULL,
	"compression" text DEFAULT 'zstd' NOT NULL,
	"encryption" text DEFAULT 'aes-256-gcm' NOT NULL,
	"error_message" text,
	"created_by" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backup_settings" ADD CONSTRAINT "backup_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_runs" ADD CONSTRAINT "backup_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backup_runs_status_idx" ON "backup_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "backup_runs_created_idx" ON "backup_runs" USING btree ("created_at");
