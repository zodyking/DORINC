// Idempotent creation of billing_integrations (migration 0059).
// Runs on boot after Drizzle migrate so billing works without manual migration steps.

const BILLING_INTEGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS "billing_integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vultr_enabled" boolean DEFAULT false NOT NULL,
  "encrypted_vultr_api_key" bytea,
  "vultr_monitored_instance_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "namecheap_enabled" boolean DEFAULT false NOT NULL,
  "namecheap_api_user" text,
  "namecheap_username" text,
  "namecheap_client_ip" text,
  "encrypted_namecheap_api_key" bytea,
  "namecheap_use_sandbox" boolean DEFAULT false NOT NULL,
  "namecheap_monitored_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "namecheap_manual_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "openrouter_billing_enabled" boolean DEFAULT true NOT NULL,
  "encrypted_openrouter_management_key" bytea,
  "updated_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
`.trim()

const NAMECHEAP_MANUAL_DOMAINS_COLUMN_SQL = `
ALTER TABLE "billing_integrations"
ADD COLUMN IF NOT EXISTS "namecheap_manual_domains" jsonb DEFAULT '[]'::jsonb NOT NULL;
`.trim()

/**
 * Create billing_integrations when missing and ensure newer columns exist. Safe on every boot.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<boolean>} true when the table was created
 */
export async function ensureBillingIntegrationsSchema(pool) {
  const { rows } = await pool.query(`SELECT to_regclass('public.billing_integrations') AS reg`)
  if (!rows[0]?.reg) {
    await pool.query(BILLING_INTEGRATIONS_SQL)
    console.log('[migrate] ensured billing integrations table (0059_billing_integrations)')
    return true
  }

  await pool.query(NAMECHEAP_MANUAL_DOMAINS_COLUMN_SQL)
  return false
}
