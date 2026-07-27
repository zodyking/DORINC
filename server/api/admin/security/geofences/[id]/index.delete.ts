import { z } from 'zod'
import { useDb } from '../../../../../db/client'
import { GeofenceError, deleteGeofence } from '../../../../../services/security/geofences.service'
import { writeAudit } from '../../../../../services/audit.service'
import { apiError } from '../../../../../utils/api-error'
import { requirePermission } from '../../../../../utils/require-permission'
import { validateParams } from '../../../../../utils/validate'

const paramsSchema = z.object({ id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const { id } = validateParams(event, paramsSchema)

  try {
    const zone = await deleteGeofence(useDb(), id)

    await writeAudit(event, {
      entityType: 'system',
      entityId: zone.id,
      action: 'security.geofence.delete',
      beforeData: { name: zone.name, kind: zone.kind, pointCount: zone.pointCount },
      riskLevel: 'high',
      permissionKey: 'system.admin.all',
    })

    return { zone }
  }
  catch (err) {
    if (err instanceof GeofenceError) {
      throw apiError(event, 'NOT_FOUND', err.message)
    }
    throw err
  }
})
