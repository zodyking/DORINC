-- Hard-delete support: freeze related entity data, then allow parent rows to be removed.
-- Dependents keep snapshots; FKs become nullable ON DELETE SET NULL.

-- Service log snapshots (invoices/estimates already have these)
ALTER TABLE "service_logs" ADD COLUMN IF NOT EXISTS "customer_snapshot" jsonb;
--> statement-breakpoint
ALTER TABLE "service_logs" ADD COLUMN IF NOT EXISTS "vehicle_snapshot" jsonb;
--> statement-breakpoint

-- Backfill service log snapshots from live joins where possible
UPDATE "service_logs" sl
SET
  "customer_snapshot" = jsonb_build_object(
    'displayName', c."display_name",
    'email', c."email",
    'phone', c."phone",
    'billingAddress', c."billing_address",
    'serviceAddress', c."service_address",
    'taxExempt', c."tax_exempt",
    'paymentTerms', c."payment_terms"
  ),
  "vehicle_snapshot" = jsonb_build_object(
    'unitType', v."unit_type",
    'busNumber', v."bus_number",
    'unitTag', v."unit_tag",
    'vin', v."vin",
    'plate', v."plate",
    'year', v."year",
    'make', v."make",
    'model', v."model",
    'odometer', CASE WHEN v."odometer" IS NULL THEN NULL ELSE v."odometer"::text END,
    'odometerUnit', v."odometer_unit"
  )
FROM "customers" c, "vehicles" v
WHERE sl."customer_id" = c."id"
  AND sl."vehicle_id" = v."id"
  AND (sl."customer_snapshot" IS NULL OR sl."vehicle_snapshot" IS NULL);
--> statement-breakpoint

-- Make FK columns nullable where hard-delete must leave dependents intact
ALTER TABLE "service_logs" ALTER COLUMN "customer_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "service_logs" ALTER COLUMN "vehicle_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "customer_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "estimates" ALTER COLUMN "customer_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "customer_id" DROP NOT NULL;
--> statement-breakpoint

ALTER TABLE "service_requests" ALTER COLUMN "vehicle_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "vehicle_change_requests" ALTER COLUMN "vehicle_id" DROP NOT NULL;
--> statement-breakpoint

-- Recreate FKs as ON DELETE SET NULL
ALTER TABLE "service_logs" DROP CONSTRAINT IF EXISTS "service_logs_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "service_logs" DROP CONSTRAINT IF EXISTS "service_logs_vehicle_id_vehicles_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_vehicle_id_vehicles_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_service_log_id_service_logs_id_fk";
--> statement-breakpoint
ALTER TABLE "estimates" DROP CONSTRAINT IF EXISTS "estimates_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "estimates" DROP CONSTRAINT IF EXISTS "estimates_vehicle_id_vehicles_id_fk";
--> statement-breakpoint
ALTER TABLE "estimates" DROP CONSTRAINT IF EXISTS "estimates_service_log_id_service_logs_id_fk";
--> statement-breakpoint
ALTER TABLE "vehicles" DROP CONSTRAINT IF EXISTS "vehicles_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "service_requests" DROP CONSTRAINT IF EXISTS "service_requests_vehicle_id_vehicles_id_fk";
--> statement-breakpoint
ALTER TABLE "vehicle_change_requests" DROP CONSTRAINT IF EXISTS "vehicle_change_requests_vehicle_id_vehicles_id_fk";
--> statement-breakpoint
ALTER TABLE "new_vehicle_requests" DROP CONSTRAINT IF EXISTS "new_vehicle_requests_result_vehicle_id_vehicles_id_fk";
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "service_logs" ADD CONSTRAINT "service_logs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_logs" ADD CONSTRAINT "service_logs_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_service_log_id_service_logs_id_fk" FOREIGN KEY ("service_log_id") REFERENCES "public"."service_logs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimates" ADD CONSTRAINT "estimates_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimates" ADD CONSTRAINT "estimates_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimates" ADD CONSTRAINT "estimates_service_log_id_service_logs_id_fk" FOREIGN KEY ("service_log_id") REFERENCES "public"."service_logs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vehicle_change_requests" ADD CONSTRAINT "vehicle_change_requests_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "new_vehicle_requests" ADD CONSTRAINT "new_vehicle_requests_result_vehicle_id_vehicles_id_fk" FOREIGN KEY ("result_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
