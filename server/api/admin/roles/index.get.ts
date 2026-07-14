import { useDb } from '../../../db/client'
import { listRoles } from '../../../services/roles.service'
import { requirePermission } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'roles.manage.all')
  return { roles: await listRoles(useDb()) }
})
