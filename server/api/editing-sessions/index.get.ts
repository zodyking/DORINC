import { useDb } from '../../db/client'
import { getActiveEditingSession } from '../../services/editing-sessions.service'
import { requireEditingSessionRead } from '../../utils/editing-session-permissions'
import { validateQuery } from '../../utils/validate'
import { editingSessionQuerySchema } from '../../../shared/validators/editing-sessions'

export default defineEventHandler(async (event) => {
  const { entityType, entityId } = validateQuery(event, editingSessionQuerySchema)
  requireEditingSessionRead(event, entityType)

  const session = await getActiveEditingSession(useDb(), entityType, entityId)
  if (!session) return { session: null }

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
})
