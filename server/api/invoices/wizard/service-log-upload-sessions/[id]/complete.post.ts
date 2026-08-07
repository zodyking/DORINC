import { useDb } from '../../../../../db/client'
import {
  completeUploadSessionById,
  ServiceLogUploadServiceError,
} from '../../../../../services/service-log-upload.service'
import { apiError } from '../../../../../utils/api-error'
import { requirePermission } from '../../../../../utils/require-permission'
import { validateParams } from '../../../../../utils/validate'
import { idParamSchema } from '../../../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.create.all')
  const { id } = validateParams(event, idParamSchema)
  try {
    const result = await completeUploadSessionById(useDb(), id, actor.id)
    return {
      session: {
        id: result.session.id,
        status: result.session.status,
        completedAt: result.session.completedAt?.toISOString() ?? null,
        serviceLogId: result.session.serviceLogId,
        invoiceId: result.session.invoiceId,
        ...result.context,
      },
      alreadyCompleted: result.alreadyCompleted,
    }
  }
  catch (err) {
    if (err instanceof ServiceLogUploadServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Upload session not found')
      if (err.code === 'NO_PHOTOS') {
        throw apiError(event, 'VALIDATION_ERROR', 'Add at least one photo before finishing')
      }
      if (err.code === 'EXPIRED') throw apiError(event, 'VALIDATION_ERROR', 'Upload session expired')
      if (err.code === 'CANCELLED') throw apiError(event, 'CONFLICT', 'Upload session was cancelled')
    }
    throw err
  }
})
