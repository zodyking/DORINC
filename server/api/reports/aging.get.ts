import { useDb } from '../../db/client'
import { getAgingReport } from '../../services/reports.service'
import { requirePermission } from '../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'reports.read.all')
  return getAgingReport(useDb())
})
