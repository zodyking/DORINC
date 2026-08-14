-- Hard-delete of a user must keep invoices, messages, service logs, and portal
-- requests. Detach the person (SET NULL) instead of blocking or deleting those rows.
ALTER TABLE "service_logs" ALTER COLUMN "submitted_by" DROP NOT NULL;
ALTER TABLE "service_logs" DROP CONSTRAINT IF EXISTS "service_logs_submitted_by_users_id_fk";
ALTER TABLE "service_logs" ADD CONSTRAINT "service_logs_submitted_by_users_id_fk"
  FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_sender_user_id_users_id_fk";
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk"
  FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "new_vehicle_requests" ALTER COLUMN "submitted_by" DROP NOT NULL;
ALTER TABLE "new_vehicle_requests" DROP CONSTRAINT IF EXISTS "new_vehicle_requests_submitted_by_users_id_fk";
ALTER TABLE "new_vehicle_requests" ADD CONSTRAINT "new_vehicle_requests_submitted_by_users_id_fk"
  FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "service_requests" ALTER COLUMN "submitted_by" DROP NOT NULL;
ALTER TABLE "service_requests" DROP CONSTRAINT IF EXISTS "service_requests_submitted_by_users_id_fk";
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_submitted_by_users_id_fk"
  FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "invoice_change_requests" ALTER COLUMN "submitted_by" DROP NOT NULL;
ALTER TABLE "invoice_change_requests" DROP CONSTRAINT IF EXISTS "invoice_change_requests_submitted_by_users_id_fk";
ALTER TABLE "invoice_change_requests" ADD CONSTRAINT "invoice_change_requests_submitted_by_users_id_fk"
  FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "vehicle_change_requests" ALTER COLUMN "submitted_by" DROP NOT NULL;
ALTER TABLE "vehicle_change_requests" DROP CONSTRAINT IF EXISTS "vehicle_change_requests_submitted_by_users_id_fk";
ALTER TABLE "vehicle_change_requests" ADD CONSTRAINT "vehicle_change_requests_submitted_by_users_id_fk"
  FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "portal_general_requests" ALTER COLUMN "submitted_by" DROP NOT NULL;
ALTER TABLE "portal_general_requests" DROP CONSTRAINT IF EXISTS "portal_general_requests_submitted_by_users_id_fk";
ALTER TABLE "portal_general_requests" ADD CONSTRAINT "portal_general_requests_submitted_by_users_id_fk"
  FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "document_change_requests" ALTER COLUMN "submitted_by" DROP NOT NULL;
ALTER TABLE "document_change_requests" DROP CONSTRAINT IF EXISTS "document_change_requests_submitted_by_users_id_fk";
ALTER TABLE "document_change_requests" DROP CONSTRAINT IF EXISTS "document_change_requests_submitted_by_fkey";
ALTER TABLE "document_change_requests" ADD CONSTRAINT "document_change_requests_submitted_by_users_id_fk"
  FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- Print jobs are business records; drop the person, keep the job.
ALTER TABLE "staples_print_jobs" ALTER COLUMN "created_by" DROP NOT NULL;
