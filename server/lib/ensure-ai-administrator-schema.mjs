/**
 * Additive AI Administrator columns for environments that may race Drizzle migrate.
 * @param {import('pg').Pool} pool
 */
export async function ensureAiAdministratorSchema(pool) {
  await pool.query(`
    ALTER TABLE "ai_provider_settings" ADD COLUMN IF NOT EXISTS "ai_administrator_model" text;
    ALTER TABLE "ai_provider_settings" ADD COLUMN IF NOT EXISTS "ai_administrator_enabled" boolean DEFAULT true NOT NULL;
  `)
}
