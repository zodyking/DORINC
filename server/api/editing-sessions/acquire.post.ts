import { useDb } from '../../db/client'
import { acquireEditingSession, EditingSessionsServiceError } from '../../services/editing-sessions.service'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { requireEditingSessionUpdate, editingSessionUpdatePermission } from '../../utils/editing-session-permissions'
import { validateBody } from '../../utils/validate'
import { editingSessionAcquireSchema } from '../../../shared/validators/editing-sessions'

export default defineEventHandler(async (event) => {
  const { entityType, entityId } = await validateBody(event, editingSessionAcquireSchema)
  const actor = requireEditingSessionUpdate(event, entityType)
  const userName = actor.name?.trim() || actor.email || 'Staff user'

  try {
    const session = await acquireEditingSession(
      useDb(),
      entityType,
      entityId,
      actor.id,
      userName,
    )

    await writeAudit(event, {
      entityType,
      entityId,
      action: 'editing_sessions.acquire',
      afterData: { sessionId: session.id, userId: actor.id },
      permissionKey: editingSessionUpdatePermission(entityType),
    })

    return {
      session: {
        id: session.id,
        entityType: session.entityType,
        entityId: session.entityId,
        userId: session.userId,
        userName: session.userNameSnapshot,
        lastHeartbeatAt: session.lastHeartbeatAt,
        acquiredAt: session.acquiredAt,
      },
    }
  }
  catch (err) {
    if (err instanceof EditingSessionsServiceError && err.code === 'SESSION_ACTIVE') {
      throw apiError(event, 'EDIT_SESSION_ACTIVE', 'Another user is editing this record', {
        editorName: err.details.editorName,
        editorUserId: err.details.editorUserId,
        sessionId: err.details.sessionId,
      })
    }
    throw err
  }
})
