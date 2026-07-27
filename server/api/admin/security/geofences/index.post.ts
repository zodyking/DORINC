import { useDb } from '../../../../db/client'
import { GeofenceError, createGeofence } from '../../../../services/security/geofences.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody } from '../../../../utils/validate'
import { geofenceCreateSchema } from '../../../../../shared/validators/security-access'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { user: { id: string, name: string } }
  requirePermission(event, 'system.admin.all')
  const body = await validateBody(event, geofenceCreateSchema)

  try {
    const zone = await createGeofence(useDb(), {
      ...body,
      actor: { id: auth.user.id, name: auth.user.name },
    })

    await writeAudit(event, {
      entityType: 'system',
      entityId: zone.id,
      action: 'security.geofence.create',
      afterData: { name: zone.name, kind: zone.kind, enabled: zone.enabled, pointCount: zone.pointCount },
      riskLevel: 'high',
      permissionKey: 'system.admin.all',
    })

    return { zone }
  }
  catch (err) {
    if (err instanceof GeofenceError) {
      throw apiError(event, 'VALIDATION_ERROR', err.message, { code: err.code })
    }
    throw err
  }
})
