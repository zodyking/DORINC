CREATE TABLE "service_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"service_category" text NOT NULL,
	"urgency" text DEFAULT 'normal' NOT NULL,
	"preferred_date" text,
	"location" text,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"invoice_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"topic" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_general_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_change_requests" ADD CONSTRAINT "invoice_change_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_change_requests" ADD CONSTRAINT "invoice_change_requests_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_change_requests" ADD CONSTRAINT "invoice_change_requests_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_change_requests" ADD CONSTRAINT "vehicle_change_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_change_requests" ADD CONSTRAINT "vehicle_change_requests_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_change_requests" ADD CONSTRAINT "vehicle_change_requests_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_general_requests" ADD CONSTRAINT "portal_general_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_general_requests" ADD CONSTRAINT "portal_general_requests_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_requests_customer_idx" ON "service_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "service_requests_status_idx" ON "service_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoice_change_requests_customer_idx" ON "invoice_change_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "invoice_change_requests_status_idx" ON "invoice_change_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vehicle_change_requests_customer_idx" ON "vehicle_change_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "vehicle_change_requests_status_idx" ON "vehicle_change_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "portal_general_requests_customer_idx" ON "portal_general_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "portal_general_requests_status_idx" ON "portal_general_requests" USING btree ("status");
