import { createNewVehicleRequest, PortalServiceError } from '../../../services/portal.service'
import { useDb } from '../../../db/client'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePortalCustomer } from '../../../utils/require-portal'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { portalNewVehicleRequestSchema } from '../../../../shared/validators/portal'

export default defineEventHandler(async (event) => {
  const user = requirePortalCustomer(event)
  requirePermission(event, 'portal.requests.own')
  const body = validateBody(event, portalNewVehicleRequestSchema)

  try {
    const request = await createNewVehicleRequest(useDb(), user.customerId, user.id, body)

    await writeAudit(event, {
      entityType: 'new_vehicle_request',
      entityId: request.id,
      action: 'portal.vehicle_request.create',
      afterData: {
        fleetTag: request.fleetTag,
        unitType: request.unitType,
        status: request.status,
      },
      permissionKey: 'portal.requests.own',
    })

    return {
      id: request.id,
      status: request.status,
      fleetTag: request.fleetTag,
      createdAt: request.createdAt,
    }
  }
  catch (err) {
    if (err instanceof PortalServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Customer not found')
      if (err.code === 'PORTAL_DISABLED') throw apiError(event, 'FORBIDDEN', 'Portal access is disabled')
    }
    throw err
  }
})
