import { useDb } from '../../../db/client'
import { releaseEditingSession, EditingSessionsServiceError } from '../../../services/editing-sessions.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.update.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    await releaseEditingSession(db, id, actor.id)

    await writeAudit(event, {
      entityType: 'editing_session',
      entityId: id,
      action: 'editing_sessions.release',
      afterData: { sessionId: id },
      permissionKey: 'invoices.update.all',
    })

    return { ok: true }
  }
  catch (err) {
    if (err instanceof EditingSessionsServiceError && err.code === 'NOT_HOLDER') {
      throw apiError(event, 'FORBIDDEN', 'You do not hold this editing session')
    }
    throw err
  }
})
