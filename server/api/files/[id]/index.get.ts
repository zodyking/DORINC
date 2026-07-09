import { useDb } from '../../../db/client'
import { FilesServiceError, getFileMeta } from '../../../services/files.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'files.read.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    return { file: await getFileMeta(useDb(), id) }
  }
  catch (err) {
    if (err instanceof FilesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'File not found')
    }
    throw err
  }
})
