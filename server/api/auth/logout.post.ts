import { logout } from '../../auth/auth.service'
import { clearSessionCookie, getSessionCookie } from '../../auth/session-cookie'
import { useDb } from '../../db/client'
import { writeAudit } from '../../services/audit.service'

export default defineEventHandler(async (event) => {
  const token = getSessionCookie(event)
  const auth = event.context.auth as { user?: { id: string, accountType: string, name: string, email: string } } | undefined

  if (token) {
    await logout(useDb(), token)
  }
  clearSessionCookie(event)

  if (auth?.user) {
    await writeAudit(event, {
      entityType: 'user',
      entityId: auth.user.id,
      action: 'auth.logout',
      actor: auth.user as never,
    })
  }

  return { status: 'signed_out' }
})
