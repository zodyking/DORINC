CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"unit_type" text DEFAULT 'truck' NOT NULL,
	"bus_number" text,
	"unit_tag" text,
	"vin" text,
	"plate" text,
	"year" integer,
	"make" text,
	"model" text,
	"trim" text,
	"body_class" text,
	"engine" text,
	"fuel_type" text,
	"color" text,
	"odometer" numeric(12, 1),
	"odometer_unit" text DEFAULT 'mi' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"vin_decode_raw" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vehicles_customer_idx" ON "vehicles" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "vehicles_vin_idx" ON "vehicles" USING btree ("vin");--> statement-breakpoint
CREATE INDEX "vehicles_archived_idx" ON "vehicles" USING btree ("archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_customer_bus_number_uq" ON "vehicles" USING btree ("customer_id","bus_number") WHERE bus_number IS NOT NULL AND archived_at IS NULL;