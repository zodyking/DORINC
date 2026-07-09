CREATE SEQUENCE "estimate_number_seq" START WITH 1;
--> statement-breakpoint
CREATE TABLE "estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_number" integer DEFAULT nextval('estimate_number_seq') NOT NULL,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"service_log_id" uuid,
	"service_request_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"estimate_date" date NOT NULL,
	"valid_until" date,
	"customer_snapshot" jsonb NOT NULL,
	"vehicle_snapshot" jsonb,
	"service_location" text,
	"po_number" text,
	"complaint" text,
	"internal_notes" text,
	"customer_notes" text,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"fees_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_exempt" boolean DEFAULT false NOT NULL,
	"tax_rate" numeric(8, 6) DEFAULT '0' NOT NULL,
	"shop_supplies_percent" numeric(8, 4),
	"created_by" uuid,
	"updated_by" uuid,
	"sent_at" timestamp with time zone,
	"sent_by" uuid,
	"customer_approved_at" timestamp with time zone,
	"customer_approved_by" uuid,
	"customer_rejected_at" timestamp with time zone,
	"customer_rejected_by" uuid,
	"customer_response_notes" text,
	"converted_invoice_id" uuid,
	"converted_at" timestamp with time zone,
	"converted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "estimates_estimate_number_unique" UNIQUE("estimate_number")
);
--> statement-breakpoint
CREATE TABLE "estimate_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" uuid NOT NULL,
	"line_type" text NOT NULL,
	"catalog_item_id" uuid,
	"catalog_snapshot" jsonb,
	"description" text NOT NULL,
	"quantity" numeric(12, 2) DEFAULT '1' NOT NULL,
	"unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"line_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"taxable" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"price_overridden" boolean DEFAULT false NOT NULL,
	"price_override_reason" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_service_log_id_service_logs_id_fk" FOREIGN KEY ("service_log_id") REFERENCES "public"."service_logs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_customer_approved_by_users_id_fk" FOREIGN KEY ("customer_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_customer_rejected_by_users_id_fk" FOREIGN KEY ("customer_rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_converted_invoice_id_invoices_id_fk" FOREIGN KEY ("converted_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_converted_by_users_id_fk" FOREIGN KEY ("converted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "estimate_line_items" ADD CONSTRAINT "estimate_line_items_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "estimate_line_items" ADD CONSTRAINT "estimate_line_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "estimate_line_items" ADD CONSTRAINT "estimate_line_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "estimates_customer_idx" ON "estimates" USING btree ("customer_id");
--> statement-breakpoint
CREATE INDEX "estimates_vehicle_idx" ON "estimates" USING btree ("vehicle_id");
--> statement-breakpoint
CREATE INDEX "estimates_status_idx" ON "estimates" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "estimates_estimate_date_idx" ON "estimates" USING btree ("estimate_date");
--> statement-breakpoint
CREATE INDEX "estimate_line_items_estimate_idx" ON "estimate_line_items" USING btree ("estimate_id");
