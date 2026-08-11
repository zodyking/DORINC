import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { users } from '../db/schema/auth'

/**
 * When enabled on an admin account, workflow notifications (team chat + staff
 * email/SMS) triggered by that user's actions are suppressed so testing does
 * not alert the rest of the team. Manual chat compose is unaffected. Channel
 * preference (Email vs Text) does not bypass this — both are suppressed.
 */
export async function shouldSuppressActorNotifications(
  db: Db,
  actorUserId: string | null | undefined,
): Promise<boolean> {
  if (!actorUserId) return false

  const [row] = await db
    .select({ silentDeveloperMode: users.silentDeveloperMode })
    .from(users)
    .where(eq(users.id, actorUserId))
    .limit(1)

  return row?.silentDeveloperMode === true
}
