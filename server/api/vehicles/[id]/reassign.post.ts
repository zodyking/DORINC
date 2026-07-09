import { useDb } from '../../../db/client'
import { reassignVehicle } from '../../../services/reassign.service'
import { writeAudit } from '../../../services/audit.service'
import { mapReassignError } from '../../../utils/map-reassign-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { reassignVehicleSchema } from '../../../../shared/validators/reassign'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'records.reassign.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, reassignVehicleSchema)

  try {
    const result = await reassignVehicle(useDb(), id, body, actor.id)

    await writeAudit(event, {
      entityType: 'vehicle',
      entityId: id,
      action: 'vehicles.reassign',
      beforeData: { customerId: result.beforeCustomerId },
      afterData: {
        customerId: result.vehicle.customerId,
        affected: result.affected,
        reason: body.reason ?? null,
      },
      permissionKey: 'records.reassign.all',
      riskLevel: 'sensitive',
    })

    return {
      vehicle: result.vehicle,
      customer: { id: result.customer.id, displayName: result.customer.displayName },
      affected: result.affected,
    }
  }
  catch (err) {
    mapReassignError(event, err)
  }
})
