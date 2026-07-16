import { useDb } from '../../db/client'
import {
  createServiceLog,
  getServiceLog,
  ServiceLogsServiceError,
  transitionServiceLog,
} from '../../services/service-logs.service'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { serviceLogCreateSchema } from '../../../shared/validators/service-logs'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'service_logs.upload.own')
  const body = await validateBody(event, serviceLogCreateSchema)
  const db = useDb()

  try {
    const log = await db.transaction(async (tx) => {
      const created = await createServiceLog(tx, body, actor.id)
      if (!body.finalize) return created

      const { log: finalized } = await transitionServiceLog(tx, created.id, 'ready_for_review')
      return finalized
    })

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
        finalized: !!body.finalize,
      },
      permissionKey: 'service_logs.upload.own',
    })

    if (body.finalize) {
      await writeAudit(event, {
        entityType: 'service_log',
        entityId: log.id,
        action: 'service_logs.status.ready_for_review',
        beforeData: { status: 'draft' },
        afterData: { status: log.status },
        changedFields: ['status'],
        permissionKey: 'service_logs.upload.own',
      })
    }

    return { log: body.finalize ? await getServiceLog(db, log.id) : log }
  }
  catch (err) {
    if (err instanceof ServiceLogsServiceError) {
      if (err.code === 'CUSTOMER_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Customer not found')
      if (err.code === 'VEHICLE_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Vehicle not found')
      if (err.code === 'VEHICLE_CUSTOMER_MISMATCH') {
        throw apiError(event, 'VALIDATION_ERROR', 'That vehicle does not belong to the selected customer')
      }
      if (err.code === 'INVALID_TRANSITION') {
        throw apiError(event, 'CONFLICT', 'This service log cannot be submitted yet')
      }
    }
    throw err
  }
})
