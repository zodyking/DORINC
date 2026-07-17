CREATE TABLE IF NOT EXISTS "document_change_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "submitted_by" uuid NOT NULL REFERENCES "users"("id"),
  "vehicle_id" uuid REFERENCES "vehicles"("id") ON DELETE SET NULL,
  "document_category" text NOT NULL,
  "action" text NOT NULL,
  "pending_file_id" uuid REFERENCES "app_files"("id") ON DELETE SET NULL,
  "customer_notes" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "reviewed_by" uuid REFERENCES "users"("id"),
  "reviewed_at" timestamp with time zone,
  "review_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "document_change_requests_customer_idx"
  ON "document_change_requests" ("customer_id");

CREATE INDEX IF NOT EXISTS "document_change_requests_status_idx"
  ON "document_change_requests" ("status");
