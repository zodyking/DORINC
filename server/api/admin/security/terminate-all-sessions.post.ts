import { clearSessionCookie } from '../../../auth/session-cookie'
import { useDb } from '../../../db/client'
import { writeAudit } from '../../../services/audit.service'
import {
  recordSessionTermination,
  revokeAllActiveSessions,
} from '../../../services/session-termination.service'
import { requirePermission } from '../../../utils/require-permission'

/**
 * Admin: revoke every active session (including the caller) and record a
 * mass-termination marker so other clients land on /auth/session-terminated.
 */
export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'system.admin.all')
  const auth = event.context.auth as {
    user?: { id: string, name?: string, email?: string }
  } | undefined
  const db = useDb()

  const revokedCount = await revokeAllActiveSessions(db)
  const record = await recordSessionTermination(db, {
    byUserId: actor.id,
    byName: auth?.user?.name || 'Administrator',
    byEmail: auth?.user?.email || '',
    revokedCount,
  })

  clearSessionCookie(event)

  await writeAudit(event, {
    entityType: 'system',
    entityId: null,
    action: 'security.sessions.terminate_all',
    afterData: {
      revokedCount,
      at: record.at,
      byUserId: actor.id,
    },
    riskLevel: 'high',
    permissionKey: 'system.admin.all',
  }).catch(() => {})

  return {
    ok: true,
    revokedCount,
    at: record.at,
    redirectTo: '/auth/session-terminated',
  }
})
