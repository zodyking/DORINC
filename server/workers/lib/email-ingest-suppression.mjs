export function emailSuppressionCandidates(input) {
  return [...new Set([
    input.internetMessageId,
    input.inReplyTo ?? '',
    ...String(input.references ?? '').split(/\s+/),
  ].map(value => String(value).trim()).filter(Boolean))]
}

/**
 * Check durable deletion tombstones and propagate suppression to new descendants.
 * @param {import('pg').Pool} pool
 */
export async function suppressesInboundEmail(pool, input) {
  const candidates = emailSuppressionCandidates(input)
  if (!candidates.length) return false

  const { rows } = await pool.query(
    `SELECT source_conversation_id, counterpart_email, subject, deleted_by, deleted_at
     FROM email_ingest_suppressions
     WHERE internet_message_id = ANY($1::text[])
     LIMIT 1`,
    [candidates],
  )
  const matched = rows[0]
  if (!matched) return false

  await pool.query(
    `INSERT INTO email_ingest_suppressions (
       internet_message_id, source_conversation_id, counterpart_email,
       subject, deleted_by, deleted_at
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (internet_message_id) DO NOTHING`,
    [
      input.internetMessageId,
      matched.source_conversation_id,
      matched.counterpart_email,
      matched.subject,
      matched.deleted_by,
      matched.deleted_at,
    ],
  )
  return true
}
