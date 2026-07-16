import { useDb } from '../../../../../db/client'
import {
  archiveFileWithDerivatives,
  FilesServiceError,
  getFileMeta,
} from '../../../../../services/files.service'
import { writeAudit } from '../../../../../services/audit.service'
import { apiError } from '../../../../../utils/api-error'
import { assertCanEditServiceLog } from '../../../../../utils/service-log-edit'
import { validateParams } from '../../../../../utils/validate'
import { idParamSchema } from '../../../../../../shared/validators/common'
import { isUserUploadFileKind } from '../../../../../../shared/files'
import { z } from 'zod'

const paramsSchema = idParamSchema.extend({ fileId: z.string().uuid() })

/** Remove a photo from an editable service log (archives file + derivatives). */
export default defineEventHandler(async (event) => {
  const { id, fileId } = validateParams(event, paramsSchema)
  const db = useDb()
  const { isReviewer } = await assertCanEditServiceLog(event, db, id)

  try {
    const meta = await getFileMeta(db, fileId)
    if (meta.ownerEntityType !== 'service_log' || meta.ownerEntityId !== id) {
      throw apiError(event, 'NOT_FOUND', 'File not found on this service log')
    }
    if (!isUserUploadFileKind(meta.fileKind)) {
      throw apiError(event, 'CONFLICT', 'Only uploaded photos can be removed')
    }
    if (!meta.mimeType.startsWith('image/')) {
      throw apiError(event, 'CONFLICT', 'Only photos can be removed here')
    }

    const file = await archiveFileWithDerivatives(db, fileId)

    const permissionKey = isReviewer ? 'service_logs.review.all' : 'service_logs.upload.own'
    await writeAudit(event, {
      entityType: 'file',
      entityId: file.id,
      action: 'files.archive',
      afterData: {
        archivedAt: file.archivedAt,
        originalFilename: file.originalFilename,
        ownerEntityType: file.ownerEntityType,
        ownerEntityId: file.ownerEntityId,
      },
      permissionKey,
      riskLevel: 'sensitive',
    })

    return { file }
  }
  catch (err) {
    if (err instanceof FilesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'File not found')
      if (err.code === 'ALREADY_ARCHIVED') throw apiError(event, 'CONFLICT', 'File is already removed')
    }
    throw err
  }
})
