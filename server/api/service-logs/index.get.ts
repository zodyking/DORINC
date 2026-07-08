import { useDb } from '../../db/client'
import { listServiceLogs } from '../../services/service-logs.service'
import { apiError } from '../../utils/api-error'
import { hasPermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { serviceLogListQuerySchema } from '../../../shared/validators/service-logs'
import type { AuthContext } from '../../utils/require-permission'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const readAll = hasPermission(event, 'service_logs.read.all')
  const readOwn = hasPermission(event, 'service_logs.read.own')
  if (!readAll && !readOwn) {
    throw apiError(event, 'FORBIDDEN', 'You do not have permission to view service logs')
  }

  const query = validateQuery(event, serviceLogListQuerySchema)

  return await listServiceLogs(useDb(), {
    ...query,
    // Mechanic scope: without read.all you only ever see your own logs
    submittedBy: readAll ? undefined : auth.user.id,
  })
})
