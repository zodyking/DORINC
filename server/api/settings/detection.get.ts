import { useDb } from '../../db/client'
import { getDetectionSettings } from '../../services/workspace-settings.service'
import { apiError } from '../../utils/api-error'

/** Staff read — powers client-side line/catalog auto-detection. */
export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { user?: unknown } | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')
  return getDetectionSettings(useDb())
})
