import { useDb } from '../../db/client'
import { getRevenueReport } from '../../services/reports.service'
import { requirePermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { reportsDateRangeSchema } from '../../../shared/validators/reports'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'reports.read.all')
  const query = validateQuery(event, reportsDateRangeSchema)
  return getRevenueReport(useDb(), query)
})
