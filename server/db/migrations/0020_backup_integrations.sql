CREATE TABLE "backup_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'google_drive' NOT NULL,
	"connected" boolean DEFAULT false NOT NULL,
	"account_email" text,
	"folder_id" text,
	"encrypted_tokens" "bytea",
	"token_expires_at" timestamp with time zone,
	"last_tested_at" timestamp with time zone,
	"last_error" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backup_settings" ADD COLUMN "notify_email" text;--> statement-breakpoint
ALTER TABLE "backup_runs" ADD COLUMN "drive_file_id" text;--> statement-breakpoint
ALTER TABLE "backup_runs" ADD COLUMN "drive_uploaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "backup_integrations" ADD CONSTRAINT "backup_integrations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "backup_integrations_provider_idx" ON "backup_integrations" USING btree ("provider");
