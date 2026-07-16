import { releaseAllEditingSessionsForUser } from '../../services/editing-sessions.service'
import { apiError } from '../../utils/api-error'
import { useDb } from '../../db/client'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { user?: { id: string } } | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Not signed in')

  await releaseAllEditingSessionsForUser(useDb(), auth.user.id)
  return { status: 'released' }
})
