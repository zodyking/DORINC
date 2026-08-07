import { useDb } from '../../../../db/client'
import {
  getPublicUploadSession,
  ServiceLogUploadServiceError,
} from '../../../../services/service-log-upload.service'
import { apiError } from '../../../../utils/api-error'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')?.trim()
  if (!token) throw apiError(event, 'NOT_FOUND', 'Upload session not found')

  try {
    const session = await getPublicUploadSession(useDb(), token)
    return { session }
  }
  catch (err) {
    if (err instanceof ServiceLogUploadServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Upload session not found')
      if (err.code === 'EXPIRED') throw apiError(event, 'VALIDATION_ERROR', 'This upload link has expired')
      if (err.code === 'CANCELLED') throw apiError(event, 'VALIDATION_ERROR', 'This upload link was cancelled')
    }
    throw err
  }
})
