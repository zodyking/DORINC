import { useDb } from '../../../db/client'
import { heartbeatEditingSession, EditingSessionsServiceError } from '../../../services/editing-sessions.service'
import { apiError } from '../../../utils/api-error'
import { requireEditingSessionActor } from '../../../utils/editing-session-permissions'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const actor = requireEditingSessionActor(event)
  const { id } = validateParams(event, idParamSchema)

  try {
    const session = await heartbeatEditingSession(useDb(), id, actor.id)
    return {
      session: {
        id: session.id,
        lastHeartbeatAt: session.lastHeartbeatAt,
      },
    }
  }
  catch (err) {
    if (err instanceof EditingSessionsServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Editing session not found or expired')
      if (err.code === 'NOT_HOLDER') throw apiError(event, 'FORBIDDEN', 'You do not hold this editing session')
    }
    throw err
  }
})
