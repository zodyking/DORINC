import { useDb } from '../../../db/client'
import { getDatabaseSizeMetrics } from '../../../services/database-size.service'
import { requirePermission } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  return getDatabaseSizeMetrics(useDb())
})
