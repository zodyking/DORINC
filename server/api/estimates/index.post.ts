import { useDb } from '../../db/client'
import { createEstimate, EstimatesServiceError } from '../../services/estimates.service'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { estimateCreateSchema } from '../../../shared/validators/estimates'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'estimates.manage.all')
  const body = await validateBody(event, estimateCreateSchema)

  try {
    const estimate = await createEstimate(useDb(), body, actor.id)

    await writeAudit(event, {
      entityType: 'estimate',
      entityId: estimate.id,
      action: 'estimates.create',
      afterData: {
        estimateNumber: estimate.estimateNumber,
        customerId: estimate.customerId,
        vehicleId: estimate.vehicleId,
        serviceLogId: estimate.serviceLogId,
        status: estimate.status,
      },
      permissionKey: 'estimates.manage.all',
    })

    return { estimate }
  }
  catch (err) {
    if (err instanceof EstimatesServiceError) {
      if (err.code === 'CUSTOMER_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Customer not found')
      if (err.code === 'VEHICLE_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Vehicle not found')
      if (err.code === 'SERVICE_LOG_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Service log not found')
      if (err.code === 'SOURCE_NOT_FOUND' || err.code === 'NOT_FOUND') {
        throw apiError(event, 'NOT_FOUND', 'Source estimate not found')
      }
      if (err.code === 'INVALID_CREATE') {
        throw apiError(event, 'VALIDATION_ERROR', 'Missing required fields for this creation path')
      }
    }
    throw err
  }
})
