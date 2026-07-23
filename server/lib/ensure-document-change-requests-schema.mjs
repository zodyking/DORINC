// Idempotent creation of the document_change_requests table (migration 0054).
// The 0054 migration file was never registered in meta/_journal.json, so
// Drizzle's migrator never applied it — production DBs are missing the table,
// which broke the dashboard portal-request count and user deletion. Runs on
// boot (after Drizzle migrate) so the feature works regardless of journal state.

const DOCUMENT_CHANGE_REQUESTS_SQL = `
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
`.trim()

/**
 * Create the document_change_requests table when missing. Safe to run on every boot.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<boolean>} true when the table was created
 */
export async function ensureDocumentChangeRequestsSchema(pool) {
  const { rows } = await pool.query(`SELECT to_regclass('public.document_change_requests') AS reg`)
  if (rows[0]?.reg) return false
  await pool.query(DOCUMENT_CHANGE_REQUESTS_SQL)
  console.log('[migrate] ensured document change requests table (0054_document_change_requests)')
  return true
}
