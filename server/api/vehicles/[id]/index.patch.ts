import { useDb } from '../../../db/client'
import { updateVehicle, VehiclesServiceError } from '../../../services/vehicles.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { vehicleUpdateSchema } from '../../../../shared/validators/vehicles'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'vehicles.update.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, vehicleUpdateSchema)

  try {
    const { vehicle, before, changedFields } = await updateVehicle(useDb(), id, body)

    if (changedFields.length) {
      await writeAudit(event, {
        entityType: 'vehicle',
        entityId: id,
        action: 'vehicles.update',
        beforeData: Object.fromEntries(changedFields.map(f => [f, before[f as keyof typeof before]])),
        afterData: Object.fromEntries(changedFields.map(f => [f, vehicle[f as keyof typeof vehicle]])),
        changedFields,
        permissionKey: 'vehicles.update.all',
      })
    }

    return { vehicle }
  }
  catch (err) {
    if (err instanceof VehiclesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Vehicle not found')
      if (err.code === 'DUPLICATE_BUS_NUMBER') {
        throw apiError(event, 'CONFLICT', 'That bus/unit number is already in use for this customer')
      }
    }
    throw err
  }
})
