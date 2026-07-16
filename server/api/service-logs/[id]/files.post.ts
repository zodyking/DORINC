import { readMultipartFormData } from 'h3'
import { useDb } from '../../../db/client'
import { FilesServiceError, maxUploadBytes, uploadFile } from '../../../services/files.service'
import { enqueueJob } from '../../../services/jobs.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { assertCanEditServiceLog } from '../../../utils/service-log-edit'
import { rateLimitKeyFromUser, requireRateLimit } from '../../../utils/require-rate-limit'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

/** Upload a photo or attachment to an editable service log. */
export default defineEventHandler(async (event) => {
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()
  const { isReviewer, actorId } = await assertCanEditServiceLog(event, db, id)
  await requireRateLimit(event, 'upload', rateLimitKeyFromUser(actorId))

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
      ownerEntityId: id,
      fileKind: 'original',
      originalFilename: filePart.filename!,
      mimeType,
      data: filePart.data,
    }, actorId)

    await enqueueJob(db, 'thumbnail_generate', { fileId: file.id })

    const permissionKey = isReviewer ? 'service_logs.review.all' : 'service_logs.upload.own'
    await writeAudit(event, {
      entityType: 'file',
      entityId: file.id,
      action: 'files.upload',
      afterData: {
        ownerEntityType: file.ownerEntityType,
        ownerEntityId: file.ownerEntityId,
        fileKind: file.fileKind,
        originalFilename: file.originalFilename,
        mimeType: file.mimeType,
        fileSizeBytes: file.fileSizeBytes,
      },
      permissionKey,
    })

    return { file }
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
