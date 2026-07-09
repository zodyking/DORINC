import { useDb } from '../../db/client'
import { getActiveEditingSession } from '../../services/editing-sessions.service'
import { requirePermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { editingSessionQuerySchema } from '../../../shared/validators/editing-sessions'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'invoices.read.all')
  const { entityType, entityId } = validateQuery(event, editingSessionQuerySchema)

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
