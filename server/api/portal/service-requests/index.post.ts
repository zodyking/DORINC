import { createServiceRequest, PortalServiceError } from '../../../services/portal.service'
import { useDb } from '../../../db/client'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePortalCustomer } from '../../../utils/require-portal'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { portalServiceRequestSchema } from '../../../../shared/validators/portal'

export default defineEventHandler(async (event) => {
  const user = requirePortalCustomer(event)
  requirePermission(event, 'portal.requests.own')
  const body = await validateBody(event, portalServiceRequestSchema)

  try {
    const log = await createServiceRequest(useDb(), user.customerId, user.id, body)

    await writeAudit(event, {
      entityType: 'service_log',
      entityId: log.id,
      action: 'portal.service_request.create',
      afterData: {
        logNumber: log.logNumber,
        vehicleId: log.vehicleId,
        workType: log.workType,
        status: log.status,
        customerRequested: log.customerRequested,
      },
      permissionKey: 'portal.requests.own',
    })

    return {
      id: log.id,
      logNumber: log.logNumber,
      status: log.status,
      createdAt: log.createdAt,
    }
  }
  catch (err) {
    if (err instanceof PortalServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Customer not found')
      if (err.code === 'PORTAL_DISABLED') throw apiError(event, 'FORBIDDEN', 'Portal access is disabled')
      if (err.code === 'INVALID_VEHICLE') throw apiError(event, 'VALIDATION_ERROR', 'Vehicle not found')
    }
    throw err
  }
})
