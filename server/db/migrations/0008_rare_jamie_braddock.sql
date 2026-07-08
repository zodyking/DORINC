CREATE SEQUENCE "public"."service_log_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1;--> statement-breakpoint
CREATE TABLE "service_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"log_number" integer DEFAULT nextval('service_log_number_seq') NOT NULL,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"service_date" date NOT NULL,
	"odometer_reading" text,
	"location" text,
	"work_type" text DEFAULT 'repair' NOT NULL,
	"complaint" text,
	"internal_notes" text,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"status_reason" text,
	"draft_line_items" jsonb,
	"invoice_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "service_logs_log_number_unique" UNIQUE("log_number")
);
--> statement-breakpoint
ALTER TABLE "service_logs" ADD CONSTRAINT "service_logs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_logs" ADD CONSTRAINT "service_logs_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_logs" ADD CONSTRAINT "service_logs_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_logs_customer_idx" ON "service_logs" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "service_logs_vehicle_idx" ON "service_logs" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "service_logs_submitted_by_idx" ON "service_logs" USING btree ("submitted_by");--> statement-breakpoint
CREATE INDEX "service_logs_status_idx" ON "service_logs" USING btree ("status");