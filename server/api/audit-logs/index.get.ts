import { useDb } from '../../db/client'
import { listAuditLogs } from '../../services/audit-logs.service'
import { requirePermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { auditListQuerySchema } from '../../../shared/validators/audit'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'audit.read.all')
  const query = validateQuery(event, auditListQuerySchema)

  return listAuditLogs(useDb(), {
    q: query.q,
    entityType: query.entityType,
    action: query.action,
    actorUserId: query.actorUserId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    category: query.category,
    page: query.page,
    pageSize: query.pageSize,
  })
})
