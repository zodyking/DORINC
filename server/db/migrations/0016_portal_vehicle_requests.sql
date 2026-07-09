CREATE TABLE "new_vehicle_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"fleet_tag" text NOT NULL,
	"unit_type" text DEFAULT 'truck' NOT NULL,
	"vin" text,
	"year" integer,
	"make" text,
	"model" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "new_vehicle_requests" ADD CONSTRAINT "new_vehicle_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "new_vehicle_requests" ADD CONSTRAINT "new_vehicle_requests_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "new_vehicle_requests_customer_idx" ON "new_vehicle_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "new_vehicle_requests_status_idx" ON "new_vehicle_requests" USING btree ("status");
