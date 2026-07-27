import { z } from 'zod'
import { useDb } from '../../../../../db/client'
import { GeofenceError, updateGeofence } from '../../../../../services/security/geofences.service'
import { writeAudit } from '../../../../../services/audit.service'
import { apiError } from '../../../../../utils/api-error'
import { requirePermission } from '../../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../../utils/validate'
import { geofenceUpdateSchema } from '../../../../../../shared/validators/security-access'

const paramsSchema = z.object({ id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const { id } = validateParams(event, paramsSchema)
  const body = await validateBody(event, geofenceUpdateSchema)

  try {
    const zone = await updateGeofence(useDb(), id, body)

    await writeAudit(event, {
      entityType: 'system',
      entityId: zone.id,
      action: 'security.geofence.update',
      afterData: { name: zone.name, kind: zone.kind, enabled: zone.enabled, pointCount: zone.pointCount },
      riskLevel: 'high',
      permissionKey: 'system.admin.all',
    })

    return { zone }
  }
  catch (err) {
    if (err instanceof GeofenceError) {
      throw apiError(event, err.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'VALIDATION_ERROR', err.message)
    }
    throw err
  }
})
