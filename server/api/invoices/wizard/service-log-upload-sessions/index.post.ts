import { useDb } from '../../../../db/client'
import {
  createServiceLogUploadSession,
  ServiceLogUploadServiceError,
} from '../../../../services/service-log-upload.service'
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
    throw err
  }
})
