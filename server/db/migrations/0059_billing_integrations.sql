CREATE TABLE "billing_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vultr_enabled" boolean DEFAULT false NOT NULL,
	"encrypted_vultr_api_key" bytea,
	"vultr_monitored_instance_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"namecheap_enabled" boolean DEFAULT false NOT NULL,
	"namecheap_api_user" text,
	"namecheap_username" text,
	"namecheap_client_ip" text,
	"encrypted_namecheap_api_key" bytea,
	"namecheap_use_sandbox" boolean DEFAULT false NOT NULL,
	"namecheap_monitored_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"openrouter_billing_enabled" boolean DEFAULT true NOT NULL,
	"encrypted_openrouter_management_key" bytea,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_integrations" ADD CONSTRAINT "billing_integrations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
