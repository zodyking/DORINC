import { useDb } from '../../db/client'
import { listStaffUsers } from '../../services/messages.service'
import { requirePermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { staffUsersQuerySchema } from '../../../shared/validators/messages'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'messages.read.own')
  const query = validateQuery(event, staffUsersQuerySchema)

  return listStaffUsers(useDb(), user.id, {
    q: query.q,
    page: query.page,
    pageSize: query.pageSize,
  })
})
