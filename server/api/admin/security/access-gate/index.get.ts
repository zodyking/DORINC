import { useDb } from '../../../../db/client'
import { getAccessGateSettings } from '../../../../services/access-gate.service'
import { requirePermission } from '../../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const settings = await getAccessGateSettings(useDb())
  return { settings }
})
