import { useDb } from '../../db/client'
import { getEstimateListStats } from '../../services/estimates.service'
import { requirePermission } from '../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'estimates.read.all')
  return getEstimateListStats(useDb())
})
