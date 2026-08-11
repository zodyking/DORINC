/**
 * Additive Susan AI defer columns for deletion requests.
 * @param {import('pg').Pool} pool
 */
export async function ensureDeletionAiSchema(pool) {
  await pool.query(`
    ALTER TABLE "entity_deletion_requests"
      ADD COLUMN IF NOT EXISTS "ai_reviewed_at" timestamp with time zone;
    ALTER TABLE "entity_deletion_requests"
      ADD COLUMN IF NOT EXISTS "ai_review_note" text;
  `)
}
