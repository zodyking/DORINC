import { getSystemStatus } from '../../../services/system-admin.service'
import { requirePermission } from '../../../utils/require-permission'
import { useDb } from '../../../db/client'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  return getSystemStatus(useDb())
})
