import { useDb } from '../../../../../db/client'
import {
  cancelUploadSession,
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
    const session = await cancelUploadSession(useDb(), id, actor.id)
    return { session: { id: session.id, status: session.status } }
  }
  catch (err) {
    if (err instanceof ServiceLogUploadServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Upload session not found')
      if (err.code === 'ALREADY_COMPLETED') {
        throw apiError(event, 'CONFLICT', 'Upload session already completed')
      }
    }
    throw err
  }
})
