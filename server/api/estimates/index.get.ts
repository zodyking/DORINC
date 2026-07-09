import { useDb } from '../../db/client'
import { listEstimates } from '../../services/estimates.service'
import { requirePermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { estimateListQuerySchema } from '../../../shared/validators/estimates'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'estimates.read.all')
  const query = validateQuery(event, estimateListQuerySchema)

  return listEstimates(useDb(), {
    q: query.q,
    status: query.status,
    customerId: query.customerId,
    vehicleId: query.vehicleId,
    includeArchived: query.includeArchived,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  })
})
