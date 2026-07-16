import { inArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import { emailIngestSuppressions } from '../db/schema/email-inbox'

export function emailSuppressionCandidates(input: {
  internetMessageId: string
  inReplyTo?: string | null
  references?: string | null
}): string[] {
  return [...new Set([
    input.internetMessageId,
    input.inReplyTo ?? '',
    ...(input.references ?? '').split(/\s+/),
  ].map(value => value.trim()).filter(Boolean))]
}

/**
 * Return true when this message belongs to a deleted thread.
 * A newly seen descendant is tombstoned too, keeping later replies suppressed.
 */
export async function suppressesInboundEmail(db: Db, input: {
  internetMessageId: string
  inReplyTo?: string | null
  references?: string | null
}): Promise<boolean> {
  const candidates = emailSuppressionCandidates(input)
  if (!candidates.length) return false

  const [matched] = await db.select()
    .from(emailIngestSuppressions)
    .where(inArray(emailIngestSuppressions.internetMessageId, candidates))
    .limit(1)
  if (!matched) return false

  await db.insert(emailIngestSuppressions).values({
    internetMessageId: input.internetMessageId,
    sourceConversationId: matched.sourceConversationId,
    counterpartEmail: matched.counterpartEmail,
    subject: matched.subject,
    deletedBy: matched.deletedBy,
    deletedAt: matched.deletedAt,
  }).onConflictDoNothing()

  return true
}
