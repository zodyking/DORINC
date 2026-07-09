import { useDb } from '../../../db/client'
import {
  adminForceReleaseEditingSession,
  EditingSessionsServiceError,
} from '../../../services/editing-sessions.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { editingSessionAdminReleaseSchema } from '../../../../shared/validators/editing-sessions'

/** Admin force-release — breaks a stale or abandoned edit lock (SPEC §12). */
export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'users.manage.all')
  const { id } = validateParams(event, idParamSchema)
  const { reason } = await validateBody(event, editingSessionAdminReleaseSchema)

  try {
    const result = await adminForceReleaseEditingSession(useDb(), id, actor.id, reason)

    await writeAudit(event, {
      entityType: result.releasedSession.entityType,
      entityId: result.releasedSession.entityId,
      action: 'editing_sessions.admin_release',
      afterData: {
        sessionId: result.releasedSession.id,
        holderUserId: result.releasedSession.holderUserId,
        holderUserName: result.releasedSession.holderUserName,
        reason,
        adminUserId: actor.id,
      },
      permissionKey: 'users.manage.all',
      riskLevel: 'sensitive',
    })

    return { ok: true }
  }
  catch (err) {
    if (err instanceof EditingSessionsServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Editing session not found or already released')
    }
    throw err
  }
})
