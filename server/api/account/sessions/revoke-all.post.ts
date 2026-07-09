import { revokeOtherAccountSessions } from '../../../services/account.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { useDb } from '../../../db/client'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { user?: { id: string }, sessionId?: string } | undefined
  if (!auth?.user || !auth.sessionId) throw apiError(event, 'UNAUTHENTICATED', 'Not signed in')

  const count = await revokeOtherAccountSessions(useDb(), auth.user.id, auth.sessionId)

  await writeAudit(event, {
    entityType: 'user',
    entityId: auth.user.id,
    action: 'account.sessions.revoke_all',
    afterData: { revokedCount: count },
    riskLevel: 'sensitive',
  })

  return { status: 'revoked', revokedCount: count }
})
