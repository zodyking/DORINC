import { setHeaders } from 'h3'
import { useDb } from '../../../db/client'
import { FilesServiceError, getFileWithData } from '../../../services/files.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

/** Download the original bytes as an attachment (SPEC §8). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'files.read.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    const file = await getFileWithData(useDb(), id)

    await writeAudit(event, {
      entityType: 'file',
      entityId: file.id,
      action: 'files.download',
      afterData: { originalFilename: file.originalFilename, sha256Hash: file.sha256Hash },
      permissionKey: 'files.read.all',
    })

    const safeName = file.originalFilename.replace(/["\\\r\n]/g, '_')
    setHeaders(event, {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.fileSizeBytes),
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Cache-Control': 'private, no-store',
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
