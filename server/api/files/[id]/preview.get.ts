import { setHeaders } from 'h3'
import { useDb } from '../../../db/client'
import { FilesServiceError, getFileWithData } from '../../../services/files.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

/** Inline render (image previews, embedded PDFs) — no attachment prompt. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'files.read.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    const file = await getFileWithData(useDb(), id)

    setHeaders(event, {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.fileSizeBytes),
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    })
    return file.binaryData
  }
  catch (err) {
    if (err instanceof FilesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'File not found')
    }
    throw err
  }
})
