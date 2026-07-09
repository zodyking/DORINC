import { useDb } from '../../../db/client'
import { listAiSuggestionsForEntity } from '../../../services/ai-jobs.service'
import { getServiceLog, ServiceLogsServiceError } from '../../../services/service-logs.service'
import { apiError } from '../../../utils/api-error'
import { hasPermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import type { AuthContext } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    const log = await getServiceLog(db, id)
    const allowed = hasPermission(event, 'service_logs.read.all')
      || hasPermission(event, 'service_logs.read.own', { ownsRecord: log.submittedBy === auth.user.id })
    if (!allowed) throw apiError(event, 'FORBIDDEN', 'You do not have permission to view this service log')

    const suggestions = await listAiSuggestionsForEntity(db, 'service_log', id, {
      featureType: 'service_log_extraction',
    })

    return { suggestions }
  }
  catch (err) {
    if (err instanceof ServiceLogsServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Service log not found')
    }
    throw err
  }
})
