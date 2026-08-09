import { readMultipartFormData } from 'h3'
import { useDb } from '../../../../db/client'
import { FilesServiceError, maxUploadBytes, uploadFile } from '../../../../services/files.service'
import { enqueueJob } from '../../../../services/jobs.service'
import {
  resolveSessionForFileUpload,
  ServiceLogUploadServiceError,
} from '../../../../services/service-log-upload.service'
import { apiError } from '../../../../utils/api-error'
import { rateLimitKeyFromIp, requireRateLimit } from '../../../../utils/require-rate-limit'

/** Public phone upload — authorized by the short-lived QR session token. */
export default defineEventHandler(async (event) => {
  await requireRateLimit(event, 'upload', rateLimitKeyFromIp(event, 'sl-upload'))
  const token = getRouterParam(event, 'token')?.trim()
  if (!token) throw apiError(event, 'NOT_FOUND', 'Upload session not found')

  const db = useDb()
  let serviceLogId: string
  let uploadedBy: string
  try {
    const resolved = await resolveSessionForFileUpload(db, token)
    serviceLogId = resolved.serviceLogId
    uploadedBy = resolved.uploadedBy
  }
  catch (err) {
    if (err instanceof ServiceLogUploadServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Upload session not found')
      if (err.code === 'EXPIRED') throw apiError(event, 'VALIDATION_ERROR', 'This upload link has expired')
      if (err.code === 'CANCELLED') throw apiError(event, 'VALIDATION_ERROR', 'This upload link was cancelled')
      if (err.code === 'ALREADY_COMPLETED') {
        throw apiError(event, 'CONFLICT', 'This upload is already finished')
      }
    }
    throw err
  }

  const parts = await readMultipartFormData(event, { maxSize: maxUploadBytes() + 1024 * 1024 })
    .catch(() => null)
  if (!parts?.length) throw apiError(event, 'VALIDATION_ERROR', 'Expected a multipart/form-data upload')

  const filePart = parts.find(p => p.name === 'file' && p.filename)
  if (!filePart) throw apiError(event, 'VALIDATION_ERROR', 'Missing "file" part in the upload')

  const mimeType = filePart.type ?? 'application/octet-stream'
  if (!mimeType.startsWith('image/')) {
    throw apiError(event, 'VALIDATION_ERROR', 'Only image uploads are supported on service logs')
  }

  try {
    const file = await uploadFile(db, {
      ownerEntityType: 'service_log',
      ownerEntityId: serviceLogId,
      fileKind: 'original',
      originalFilename: filePart.filename!,
      mimeType,
      data: filePart.data,
    }, uploadedBy)

    await enqueueJob(db, 'thumbnail_generate', { fileId: file.id }).catch(() => {})
    return {
      file: { id: file.id, originalFilename: file.originalFilename },
      serviceLogId,
    }
  }
  catch (err) {
    if (err instanceof FilesServiceError) {
      if (err.code === 'FILE_TOO_LARGE') throw apiError(event, 'VALIDATION_ERROR', err.message)
      if (err.code === 'MIME_NOT_ALLOWED' || err.code === 'CONTENT_MISMATCH' || err.code === 'EMPTY_FILE') {
        throw apiError(event, 'VALIDATION_ERROR', err.message)
      }
    }
    throw err
  }
})
