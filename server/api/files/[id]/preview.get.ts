import { setHeaders } from 'h3'
import { useDb } from '../../../db/client'
import { FilesServiceError, getFileWithData } from '../../../services/files.service'
import { assertCanReadFile } from '../../../services/file-access.service'
import { apiError } from '../../../utils/api-error'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import type { AuthContext } from '../../../utils/require-permission'

/** Inline render (image previews, embedded PDFs) — no attachment prompt. */
export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    const file = await getFileWithData(db, id)
    await assertCanReadFile(event, db, file)

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
