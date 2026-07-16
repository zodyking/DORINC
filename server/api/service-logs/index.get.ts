import { useDb } from '../../db/client'
import { resolveServiceLogInvoiceLinkStatuses } from '../../services/invoice-link-status.service'
import { listServiceLogs } from '../../services/service-logs.service'
import { apiError } from '../../utils/api-error'
import { canMarkServiceLogReady, canRevertServiceLogInvoice, canSendServiceLogToInvoice } from '../../utils/service-log-actions'
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
  const db = useDb()

  const result = await listServiceLogs(db, {
    ...query,
    // Mechanic scope: without read.all you only ever see your own logs
    submittedBy: readAll ? undefined : auth.user.id,
  })

  const invoiceIds = result.items
    .map(log => log.invoiceId)
    .filter((id): id is string => !!id)
  const invoiceLinkStatuses = await resolveServiceLogInvoiceLinkStatuses(db, invoiceIds)

  const items = await Promise.all(result.items.map(async (log) => ({
    ...log,
    invoiceLinkStatus: log.invoiceId ? invoiceLinkStatuses.get(log.invoiceId) ?? null : null,
    canMarkReady: canMarkServiceLogReady(event, log),
    canSendToInvoice: canSendServiceLogToInvoice(event, log),
    canRevertInvoice: await canRevertServiceLogInvoice(event, db, log),
  })))

  return { ...result, items }
})
