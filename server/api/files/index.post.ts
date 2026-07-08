import { readMultipartFormData } from 'h3'
import { useDb } from '../../db/client'
import { FilesServiceError, maxUploadBytes, uploadFile } from '../../services/files.service'
import { enqueueJob } from '../../services/jobs.service'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { requirePermission } from '../../utils/require-permission'
import { fileUploadFieldsSchema } from '../../../shared/validators/files'

/**
 * Multipart upload — one file part named "file" plus owner fields (SPEC §8).
 * Bytes land in PostgreSQL bytea; sha256 + size recorded; MIME validated
 * against both an allowlist and the actual file magic bytes.
 */
export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'files.upload.all')

  const parts = await readMultipartFormData(event, { maxSize: maxUploadBytes() + 1024 * 1024 })
    .catch(() => null)
  if (!parts?.length) throw apiError(event, 'VALIDATION_ERROR', 'Expected a multipart/form-data upload')

  const filePart = parts.find(p => p.name === 'file' && p.filename)
  if (!filePart) throw apiError(event, 'VALIDATION_ERROR', 'Missing "file" part in the upload')

  const fields: Record<string, string> = {}
  for (const p of parts) {
    if (p.name && p.name !== 'file' && !p.filename) fields[p.name] = p.data.toString('utf8')
  }

  const parsed = fileUploadFieldsSchema.safeParse(fields)
  if (!parsed.success) throw apiError(event, 'VALIDATION_ERROR', 'Invalid upload fields', parsed.error.issues)

  try {
    const db = useDb()
    const file = await uploadFile(db, {
      ownerEntityType: parsed.data.ownerEntityType,
      ownerEntityId: parsed.data.ownerEntityId,
      fileKind: parsed.data.fileKind ?? 'attachment',
      originalFilename: filePart.filename!,
      mimeType: filePart.type ?? 'application/octet-stream',
      data: filePart.data,
    }, actor.id)

    // Image uploads get worker-generated thumbnail + preview rows (P1-14)
    if (file.mimeType.startsWith('image/') && (file.fileKind === 'original' || file.fileKind === 'attachment')) {
      await enqueueJob(db, 'thumbnail_generate', { fileId: file.id })
    }

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
        sha256Hash: file.sha256Hash,
      },
      permissionKey: 'files.upload.all',
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
