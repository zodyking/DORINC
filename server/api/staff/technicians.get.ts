import { useDb } from '../../db/client'
import { listTechnicianOptions } from '../../services/technicians.service'
import { apiError } from '../../utils/api-error'
import type { AuthContext } from '../../utils/require-permission'
import { hasPermission } from '../../utils/require-permission'

/** Lightweight technician picker for invoice / service-log upload flows. */
export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) {
    throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')
  }
  if (
    !hasPermission(event, 'invoices.create.all')
    && !hasPermission(event, 'service_logs.upload.own')
  ) {
    throw apiError(event, 'FORBIDDEN', 'You do not have permission to perform this action')
  }
  return listTechnicianOptions(useDb())
})
