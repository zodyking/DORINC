import { useDb } from '../../../../../db/client'
import {
  getUploadSessionForStaff,
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
    const session = await getUploadSessionForStaff(useDb(), id, actor.id)
    return { session }
  }
  catch (err) {
    if (err instanceof ServiceLogUploadServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Upload session not found')
    }
    throw err
  }
})
