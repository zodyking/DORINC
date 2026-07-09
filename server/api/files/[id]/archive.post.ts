import { useDb } from '../../../db/client'
import { archiveFile, FilesServiceError } from '../../../services/files.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'files.archive.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    const file = await archiveFile(useDb(), id)

    await writeAudit(event, {
      entityType: 'file',
      entityId: file.id,
      action: 'files.archive',
      afterData: { archivedAt: file.archivedAt, originalFilename: file.originalFilename },
      permissionKey: 'files.archive.all',
      riskLevel: 'sensitive',
    })

    return { file }
  }
  catch (err) {
    if (err instanceof FilesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'File not found')
      if (err.code === 'ALREADY_ARCHIVED') throw apiError(event, 'CONFLICT', 'File is already archived')
    }
    throw err
  }
})
