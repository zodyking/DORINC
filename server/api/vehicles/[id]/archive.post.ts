import { useDb } from '../../../db/client'
import { archiveVehicle, VehiclesServiceError } from '../../../services/vehicles.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'vehicles.archive.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    const vehicle = await archiveVehicle(useDb(), id)

    await writeAudit(event, {
      entityType: 'vehicle',
      entityId: id,
      action: 'vehicles.archive',
      afterData: { archivedAt: vehicle.archivedAt },
      permissionKey: 'vehicles.archive.all',
      riskLevel: 'sensitive',
    })

    return { vehicle }
  }
  catch (err) {
    if (err instanceof VehiclesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Vehicle not found')
      if (err.code === 'ALREADY_ARCHIVED') throw apiError(event, 'CONFLICT', 'Vehicle is already archived')
    }
    throw err
  }
})
