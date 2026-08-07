import { useDb } from '../../../../db/client'
import {
  completeUploadSessionByToken,
  ServiceLogUploadServiceError,
} from '../../../../services/service-log-upload.service'
import { apiError } from '../../../../utils/api-error'
import { rateLimitKeyFromIp, requireRateLimit } from '../../../../utils/require-rate-limit'

export default defineEventHandler(async (event) => {
  await requireRateLimit(event, 'upload', rateLimitKeyFromIp(event, 'sl-complete'))
  const token = getRouterParam(event, 'token')?.trim()
  if (!token) throw apiError(event, 'NOT_FOUND', 'Upload session not found')

  try {
    const result = await completeUploadSessionByToken(useDb(), token)
    return {
      ok: true,
      alreadyCompleted: result.alreadyCompleted,
      invoiceNumberFormatted: result.context.invoiceNumberFormatted,
      serviceLogId: result.session.serviceLogId,
    }
  }
  catch (err) {
    if (err instanceof ServiceLogUploadServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Upload session not found')
      if (err.code === 'EXPIRED') throw apiError(event, 'VALIDATION_ERROR', 'This upload link has expired')
      if (err.code === 'CANCELLED') throw apiError(event, 'VALIDATION_ERROR', 'This upload link was cancelled')
      if (err.code === 'NO_PHOTOS') {
        throw apiError(event, 'VALIDATION_ERROR', 'Add at least one photo before finishing')
      }
    }
    throw err
  }
})
