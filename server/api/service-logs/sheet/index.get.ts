import { useDb } from '../../../db/client'
import { getServiceLogSheetPayload } from '../../../services/service-log-sheet.service'
import { apiError } from '../../../utils/api-error'
import { hasPermission } from '../../../utils/require-permission'
import type { AuthContext } from '../../../utils/require-permission'

/** Sheet document + catalog picks for the rich editor / print payload. */
export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const canReadCatalog = hasPermission(event, 'catalog.read.all')
    || hasPermission(event, 'catalog.manage.all')
  const canPrint = hasPermission(event, 'service_logs.read.all')
    || hasPermission(event, 'service_logs.read.own')
    || hasPermission(event, 'service_logs.upload.own')

  if (!canReadCatalog && !canPrint) {
    throw apiError(event, 'FORBIDDEN', 'You do not have permission to view the service log sheet')
  }

  return getServiceLogSheetPayload(useDb())
})
