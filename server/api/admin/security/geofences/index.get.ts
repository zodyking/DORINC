import { useDb } from '../../../../db/client'
import { listGeofences } from '../../../../services/security/geofences.service'
import { requirePermission } from '../../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  return { items: await listGeofences(useDb()) }
})
