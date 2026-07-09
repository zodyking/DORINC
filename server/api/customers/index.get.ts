import { z } from 'zod'
import { useDb } from '../../db/client'
import { listCustomers } from '../../services/customers.service'
import { requirePermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { paginationSchema } from '../../../shared/validators/common'

const listQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
  kind: z.enum(['fleet', 'individual']).optional(),
  portal: z.enum(['on', 'off']).optional(),
  includeArchived: z.coerce.boolean().optional(),
  sort: z.enum(['name-asc', 'name-desc', 'newest']).optional(),
})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers.read.all')
  const query = validateQuery(event, listQuerySchema)

  return listCustomers(useDb(), {
    q: query.q,
    kind: query.kind,
    portal: query.portal === undefined ? undefined : query.portal === 'on',
    includeArchived: query.includeArchived,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  })
})
