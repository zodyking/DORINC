CREATE TABLE "customer_credential_email_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"contact_id" uuid,
	"portal_user_id" uuid NOT NULL,
	"recipient_email" text NOT NULL,
	"send_type" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"worker_job_id" uuid,
	"sent_at" timestamp with time zone,
	"sent_by" uuid NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_credential_email_logs" ADD CONSTRAINT "customer_credential_email_logs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credential_email_logs" ADD CONSTRAINT "customer_credential_email_logs_contact_id_customer_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."customer_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credential_email_logs" ADD CONSTRAINT "customer_credential_email_logs_portal_user_id_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credential_email_logs" ADD CONSTRAINT "customer_credential_email_logs_worker_job_id_worker_jobs_id_fk" FOREIGN KEY ("worker_job_id") REFERENCES "public"."worker_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credential_email_logs" ADD CONSTRAINT "customer_credential_email_logs_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_credential_email_logs_customer_idx" ON "customer_credential_email_logs" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_credential_email_logs_created_idx" ON "customer_credential_email_logs" USING btree ("created_at");
