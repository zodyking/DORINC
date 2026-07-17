import { setHeaders } from 'h3'
import { z } from 'zod'
import { useDb } from '../../../../../../../db/client'
import { getMessageAttachment } from '../../../../../../../services/message-attachments.service'
import {
  safeAttachmentDownloadName,
} from '../../../../../../../services/email-attachment.service'
import { FilesServiceError } from '../../../../../../../services/files.service'
import { apiError } from '../../../../../../../utils/api-error'
import { requirePermission } from '../../../../../../../utils/require-permission'
import { validateParams } from '../../../../../../../utils/validate'
import { uuidSchema } from '../../../../../../../../shared/validators/common'

const paramsSchema = z.object({
  id: uuidSchema,
  messageId: uuidSchema,
  fileId: uuidSchema,
})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'messages.read.own')
  const { id: conversationId, messageId, fileId } = validateParams(event, paramsSchema)

  try {
    const file = await getMessageAttachment(useDb(), conversationId, messageId, fileId)
    const filename = safeAttachmentDownloadName(file.originalFilename)

    setHeaders(event, {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.fileSizeBytes),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    return file.binaryData
  }
  catch (err) {
    if (err instanceof FilesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Attachment not found')
    }
    throw err
  }
})
