import { useDb } from '../../db/client'
import { createServiceLog, ServiceLogsServiceError } from '../../services/service-logs.service'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { serviceLogCreateSchema } from '../../../shared/validators/service-logs'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'service_logs.upload.own')
  const body = await validateBody(event, serviceLogCreateSchema)

  try {
    const log = await createServiceLog(useDb(), body, actor.id)

    await writeAudit(event, {
      entityType: 'service_log',
      entityId: log.id,
      action: 'service_logs.create',
      afterData: {
        logNumber: log.logNumber,
        customerId: log.customerId,
        vehicleId: log.vehicleId,
        serviceDate: log.serviceDate,
        workType: log.workType,
        status: log.status,
      },
      permissionKey: 'service_logs.upload.own',
    })

    return { log }
  }
  catch (err) {
    if (err instanceof ServiceLogsServiceError) {
      if (err.code === 'CUSTOMER_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Customer not found')
      if (err.code === 'VEHICLE_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Vehicle not found')
      if (err.code === 'VEHICLE_CUSTOMER_MISMATCH') {
        throw apiError(event, 'VALIDATION_ERROR', 'That vehicle does not belong to the selected customer')
      }
    }
    throw err
  }
})
