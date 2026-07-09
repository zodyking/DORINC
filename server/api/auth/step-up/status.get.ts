import { getStepUpStatus } from '../../../services/step-up.service'
import { useDb } from '../../../db/client'
import { apiError } from '../../../utils/api-error'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { sessionId?: string } | undefined
  if (!auth?.sessionId) throw apiError(event, 'UNAUTHENTICATED', 'Not signed in')

  const status = await getStepUpStatus(useDb(), auth.sessionId)
  return {
    verified: status.verified,
    expiresAt: status.expiresAt?.toISOString() ?? null,
  }
})
