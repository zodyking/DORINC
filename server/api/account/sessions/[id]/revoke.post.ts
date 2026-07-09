import {
  AccountServiceError,
  revokeAccountSession,
} from '../../../../services/account.service'
import { writeAudit } from '../../../../services/audit.service'
import { clearSessionCookie, getSessionCookie } from '../../../../auth/session-cookie'
import { logout } from '../../../../auth/auth.service'
import { apiError } from '../../../../utils/api-error'
import { validateParams } from '../../../../utils/validate'
import { useDb } from '../../../../db/client'
import { idParamSchema } from '../../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as {
    user?: { id: string }
    sessionId?: string
    sessionToken?: string
  } | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Not signed in')

  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    await revokeAccountSession(db, auth.user.id, id)

    await writeAudit(event, {
      entityType: 'session',
      entityId: id,
      action: 'account.session.revoke',
      riskLevel: 'sensitive',
    })

    const revokedCurrent = id === auth.sessionId
    if (revokedCurrent) {
      const token = getSessionCookie(event)
      if (token) await logout(db, token)
      clearSessionCookie(event)
    }

    return { status: 'revoked', revokedCurrent }
  }
  catch (err) {
    if (err instanceof AccountServiceError && err.code === 'SESSION_NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Session not found')
    }
    throw err
  }
})
