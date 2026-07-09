import { useDb } from '../../db/client'
import { listAuditLogFacets } from '../../services/audit-logs.service'
import { requirePermission } from '../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'audit.read.all')
  return listAuditLogFacets(useDb())
})
