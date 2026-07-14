import { z } from 'zod'
import { useDb } from '../../../db/client'
import { listUsers } from '../../../services/users.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateQuery } from '../../../utils/validate'
import { paginationSchema } from '../../../../shared/validators/common'

const listQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
  status: z.enum(['pending', 'active', 'disabled', 'rejected']).optional(),
  // Accept any string - filters by account type key from DB
  accountType: z.string().trim().min(1).max(100).optional(),
})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'users.read.all')
  const query = validateQuery(event, listQuerySchema)

  return listUsers(useDb(), {
    q: query.q,
    status: query.status,
    accountType: query.accountType,
    page: query.page,
    pageSize: query.pageSize,
  })
})
