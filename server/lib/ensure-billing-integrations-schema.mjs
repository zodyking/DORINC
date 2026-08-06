// Idempotent billing_integrations table for infrastructure billing settings.
// Runs on boot after Drizzle migrate.

const BILLING_INTEGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS "billing_integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vultr_enabled" boolean DEFAULT false NOT NULL,
  "encrypted_vultr_api_key" bytea,
  "vultr_monitored_instance_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "encrypted_vultr_username" bytea,
  "encrypted_vultr_password" bytea,
  "domain_renewals" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "cloudflare_enabled" boolean DEFAULT false NOT NULL,
  "cloudflare_account_id" text,
  "encrypted_cloudflare_api_token" bytea,
  "encrypted_cloudflare_username" bytea,
  "encrypted_cloudflare_password" bytea,
  "openrouter_billing_enabled" boolean DEFAULT true NOT NULL,
  "encrypted_openrouter_management_key" bytea,
  "encrypted_openrouter_username" bytea,
  "encrypted_openrouter_password" bytea,
  "updated_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
`.trim()

const DOMAIN_RENEWALS_COLUMN_SQL = `
ALTER TABLE "billing_integrations"
ADD COLUMN IF NOT EXISTS "domain_renewals" jsonb DEFAULT '[]'::jsonb NOT NULL;
`.trim()

const CLOUDFLARE_COLUMNS_SQL = `
ALTER TABLE "billing_integrations" ADD COLUMN IF NOT EXISTS "cloudflare_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "billing_integrations" ADD COLUMN IF NOT EXISTS "cloudflare_account_id" text;
ALTER TABLE "billing_integrations" ADD COLUMN IF NOT EXISTS "encrypted_cloudflare_api_token" bytea;
ALTER TABLE "billing_integrations" ADD COLUMN IF NOT EXISTS "encrypted_vultr_username" bytea;
ALTER TABLE "billing_integrations" ADD COLUMN IF NOT EXISTS "encrypted_vultr_password" bytea;
ALTER TABLE "billing_integrations" ADD COLUMN IF NOT EXISTS "encrypted_cloudflare_username" bytea;
ALTER TABLE "billing_integrations" ADD COLUMN IF NOT EXISTS "encrypted_cloudflare_password" bytea;
ALTER TABLE "billing_integrations" ADD COLUMN IF NOT EXISTS "encrypted_openrouter_username" bytea;
ALTER TABLE "billing_integrations" ADD COLUMN IF NOT EXISTS "encrypted_openrouter_password" bytea;
`.trim()

const DROP_LEGACY_NAMECHEAP_COLUMNS_SQL = `
ALTER TABLE "billing_integrations" DROP COLUMN IF EXISTS "namecheap_enabled";
ALTER TABLE "billing_integrations" DROP COLUMN IF EXISTS "namecheap_api_user";
ALTER TABLE "billing_integrations" DROP COLUMN IF EXISTS "namecheap_username";
ALTER TABLE "billing_integrations" DROP COLUMN IF EXISTS "namecheap_client_ip";
ALTER TABLE "billing_integrations" DROP COLUMN IF EXISTS "encrypted_namecheap_api_key";
ALTER TABLE "billing_integrations" DROP COLUMN IF EXISTS "namecheap_use_sandbox";
ALTER TABLE "billing_integrations" DROP COLUMN IF EXISTS "namecheap_monitored_domains";
ALTER TABLE "billing_integrations" DROP COLUMN IF EXISTS "namecheap_manual_domains";
`.trim()

/**
 * Postgres still resolves column names at plan time, so an UPDATE that references
 * `namecheap_manual_domains` throws when the column is already gone — even if the
 * WHERE clause guards with EXISTS. Check first, then migrate only when present.
 *
 * @param {import('pg').Pool} pool
 */
async function migrateLegacyManualDomains(pool) {
  const { rows } = await pool.query(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'billing_integrations'
      AND column_name = 'namecheap_manual_domains'
    LIMIT 1
  `)
  if (!rows[0]) return

  await pool.query(`
    UPDATE "billing_integrations"
    SET "domain_renewals" = "namecheap_manual_domains"
    WHERE ("domain_renewals" IS NULL OR "domain_renewals" = '[]'::jsonb)
      AND "namecheap_manual_domains" IS NOT NULL
      AND "namecheap_manual_domains" <> '[]'::jsonb
  `)
}

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<boolean>} true when the table was created
 */
export async function ensureBillingIntegrationsSchema(pool) {
  const { rows } = await pool.query(`SELECT to_regclass('public.billing_integrations') AS reg`)
  if (!rows[0]?.reg) {
    await pool.query(BILLING_INTEGRATIONS_SQL)
    console.log('[migrate] ensured billing integrations table')
    return true
  }

  await pool.query(DOMAIN_RENEWALS_COLUMN_SQL)
  await migrateLegacyManualDomains(pool)
  await pool.query(DROP_LEGACY_NAMECHEAP_COLUMNS_SQL)
  await pool.query(CLOUDFLARE_COLUMNS_SQL)
  return false
}
