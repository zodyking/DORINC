import { useDb } from '../../db/client'
import { createVehicle, VehiclesServiceError } from '../../services/vehicles.service'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { vehicleCreateSchema } from '../../../shared/validators/vehicles'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'vehicles.create.all')
  const body = await validateBody(event, vehicleCreateSchema)

  try {
    const vehicle = await createVehicle(useDb(), body, actor.id)

    await writeAudit(event, {
      entityType: 'vehicle',
      entityId: vehicle.id,
      action: 'vehicles.create',
      afterData: {
        customerId: vehicle.customerId,
        busNumber: vehicle.busNumber,
        vin: vehicle.vin,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
      },
      permissionKey: 'vehicles.create.all',
    })

    return { vehicle }
  }
  catch (err) {
    if (err instanceof VehiclesServiceError) {
      if (err.code === 'CUSTOMER_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Customer not found')
      if (err.code === 'DUPLICATE_BUS_NUMBER') {
        throw apiError(event, 'CONFLICT', 'That bus/unit number is already in use for this customer')
      }
    }
    throw err
  }
})
