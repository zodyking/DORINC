ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "step_up_verified_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "backup_recovery_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backup_run_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"valid" boolean,
	"toc_entries" integer,
	"error_message" text,
	"tested_by" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backup_recovery_tests" ADD CONSTRAINT "backup_recovery_tests_backup_run_id_backup_runs_id_fk" FOREIGN KEY ("backup_run_id") REFERENCES "public"."backup_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "backup_recovery_tests" ADD CONSTRAINT "backup_recovery_tests_tested_by_users_id_fk" FOREIGN KEY ("tested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backup_recovery_tests_run_idx" ON "backup_recovery_tests" USING btree ("backup_run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backup_recovery_tests_created_idx" ON "backup_recovery_tests" USING btree ("created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suspicious_activity_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_key" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" uuid,
	"ip_address" inet,
	"status" text DEFAULT 'open' NOT NULL,
	"dismissed_at" timestamp with time zone,
	"dismissed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suspicious_activity_alerts" ADD CONSTRAINT "suspicious_activity_alerts_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "suspicious_activity_alerts" ADD CONSTRAINT "suspicious_activity_alerts_dismissed_by_users_id_fk" FOREIGN KEY ("dismissed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suspicious_activity_alerts_status_idx" ON "suspicious_activity_alerts" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suspicious_activity_alerts_created_idx" ON "suspicious_activity_alerts" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suspicious_activity_alerts_rule_idx" ON "suspicious_activity_alerts" USING btree ("rule_key");
