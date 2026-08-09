import { useDb } from '../../../../db/client'
import {
  createServiceLogUploadSession,
  ServiceLogUploadServiceError,
} from '../../../../services/service-log-upload.service'
import { ServiceLogsServiceError } from '../../../../services/service-logs.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody } from '../../../../utils/validate'
import { serviceLogUploadSessionCreateSchema } from '../../../../../shared/validators/service-log-upload'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.create.all')
  const body = await validateBody(event, serviceLogUploadSessionCreateSchema)
  const db = useDb()

  try {
    const created = await createServiceLogUploadSession(db, {
      createdBy: actor.id,
      technicianId: body.technicianId,
      customerId: body.customerId,
      vehicleId: body.vehicleId,
      invoiceId: body.invoiceId,
      serviceDate: body.serviceDate,
    })

    return {
      session: {
        id: created.session.id,
        status: created.session.status,
        expiresAt: created.session.expiresAt.toISOString(),
        serviceLogId: created.session.serviceLogId,
        invoiceId: created.session.invoiceId,
        technicianId: created.session.technicianId,
        uploadUrl: created.uploadUrl,
        uploadPath: created.uploadPath,
        ...created.context,
      },
      token: created.token,
      serviceLog: {
        id: created.serviceLog.id,
        logNumber: created.serviceLog.logNumber,
      },
    }
  }
  catch (err) {
    if (err instanceof ServiceLogUploadServiceError) {
      if (err.code === 'TECHNICIAN_NOT_FOUND') {
        throw apiError(event, 'VALIDATION_ERROR', 'Selected technician was not found')
      }
      if (err.code === 'INVOICE_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice not found')
    }
    if (err instanceof ServiceLogsServiceError) {
      if (err.code === 'CUSTOMER_NOT_FOUND') {
        throw apiError(event, 'VALIDATION_ERROR', 'Customer not found — go back and pick a customer')
      }
      if (err.code === 'VEHICLE_NOT_FOUND') {
        throw apiError(event, 'VALIDATION_ERROR', 'Vehicle not found — go back and pick a vehicle')
      }
      if (err.code === 'VEHICLE_CUSTOMER_MISMATCH') {
        throw apiError(event, 'VALIDATION_ERROR', 'That vehicle does not belong to the selected customer')
      }
    }
    console.error('[service-log-upload-sessions] create failed:', err)
    throw apiError(
      event,
      'INTERNAL_ERROR',
      'Could not start service log upload — check customer, vehicle, and technician, then try again',
    )
  }
})
