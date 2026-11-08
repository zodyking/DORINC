const INVOICE_ONLINE_ACCESS_SQL = `
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "online_access_token" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "online_access_customer_slug" text;
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_online_access_token_uq"
  ON "invoices" ("online_access_token")
  WHERE "online_access_token" IS NOT NULL;
`.trim()

/**
 * @param {import('pg').Pool} pool
 */
export async function ensureInvoiceOnlineAccessSchema(pool) {
  const { rows } = await pool.query(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'online_access_token'
    LIMIT 1
  `)
  await pool.query(INVOICE_ONLINE_ACCESS_SQL)
  if (rows.length) return false
  console.log('[migrate] ensured invoice online access columns')
  return true
}
