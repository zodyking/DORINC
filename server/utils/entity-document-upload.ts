import { readMultipartFormData } from 'h3'
import type { H3Event } from 'h3'
import type { Db } from '../db/client'
import type { FileDocumentCategory } from '../../shared/document-categories'
import type { FileOwnerEntityType } from '../db/schema/files'
import { FilesServiceError, maxUploadBytes } from '../services/files.service'
import { uploadEntityDocument } from '../services/entity-documents.service'
import { apiError } from './api-error'

export async function readEntityDocumentUpload(
  event: H3Event,
  opts: {
    ownerEntityType: FileOwnerEntityType
    ownerEntityId: string
    documentCategory: FileDocumentCategory
    createdBy: string | null
    db: Db
  },
) {
  const parts = await readMultipartFormData(event, { maxSize: maxUploadBytes() + 1024 * 1024 })
    .catch(() => null)
  if (!parts?.length) throw apiError(event, 'VALIDATION_ERROR', 'Expected a multipart/form-data upload')

  const filePart = parts.find(p => p.name === 'file' && p.filename)
  if (!filePart) throw apiError(event, 'VALIDATION_ERROR', 'Missing "file" part in the upload')

  try {
    const file = await uploadEntityDocument(opts.db, {
      ownerEntityType: opts.ownerEntityType,
      ownerEntityId: opts.ownerEntityId,
      documentCategory: opts.documentCategory,
      originalFilename: filePart.filename!,
      mimeType: filePart.type ?? 'application/octet-stream',
      data: filePart.data,
    }, opts.createdBy)

    return file
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
}
