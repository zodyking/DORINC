import { useDb } from '../../../db/client'
import { listAssignableStaffAccountTypes } from '../../../services/staff-invite.service'
import { requirePermission } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'users.manage.all')
  const items = await listAssignableStaffAccountTypes(useDb())
  return { items }
})
