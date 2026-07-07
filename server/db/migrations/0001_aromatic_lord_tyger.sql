CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"action" text NOT NULL,
	"before_data" jsonb,
	"after_data" jsonb,
	"changed_fields" jsonb,
	"actor_user_id" uuid,
	"actor_name" text,
	"actor_email" text,
	"actor_account_type" text,
	"permission_key" text,
	"risk_level" text DEFAULT 'normal' NOT NULL,
	"ip_address" "inet",
	"user_agent" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");