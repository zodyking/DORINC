import { z } from 'zod'
import { useDb } from '../../db/client'
import { listVehicles } from '../../services/vehicles.service'
import { requirePermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { paginationSchema, uuidSchema } from '../../../shared/validators/common'

const listQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
  customerId: uuidSchema.optional(),
  unitType: z.enum(['truck', 'bus', 'equipment', 'tractor', 'other']).optional(),
  includeArchived: z.coerce.boolean().optional(),
  sort: z.enum(['tag-asc', 'tag-desc', 'customer-asc', 'odo-desc', 'newest']).optional(),
})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'vehicles.read.all')
  const query = validateQuery(event, listQuerySchema)

  return listVehicles(useDb(), {
    q: query.q,
    customerId: query.customerId,
    unitType: query.unitType,
    includeArchived: query.includeArchived,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  })
})
