import type { AuthContext } from '../../utils/require-permission'
import { apiError } from '../../utils/api-error'
import { useDb } from '../../db/client'
import { getAnnouncementGate } from '../../services/announcements.service'
import { clearStaleSessionCookie } from '../../auth/session-cookie'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as (AuthContext & {
    user: { name: string, email: string, username: string | null, customerId: string | null, mustChangePassword?: boolean }
  }) | undefined
  if (!auth?.user) {
    const staleCookieCleared = clearStaleSessionCookie(event)
    throw apiError(event, 'UNAUTHENTICATED', 'Not signed in', {
      staleCookieCleared,
    })
  }

  const effective = new Set([...auth.roleGrants, ...auth.overrides.allow])
  for (const denied of auth.overrides.deny) effective.delete(denied)

  const db = useDb()
  const isCustomer = auth.user.accountType === 'customer'
  const announcementGate = isCustomer
    ? { locked: false, pendingCount: 0, currentId: null }
    : await getAnnouncementGate(db, auth.user.id, auth.user.accountType)

  return {
    user: {
      id: auth.user.id,
      name: auth.user.name,
      email: auth.user.email,
      username: auth.user.username,
      accountType: auth.user.accountType,
      customerId: auth.user.customerId,
      mustChangePassword: auth.user.mustChangePassword ?? false,
    },
    permissions: [...effective].sort(),
    announcementGate,
  }
})
