import { setHeaders } from 'h3'
import { z } from 'zod'
import { useDb } from '../../../../../../../db/client'
import { getMessageAttachment } from '../../../../../../../services/message-attachments.service'
import { FilesServiceError, resolveImageDisplayPreview } from '../../../../../../../services/files.service'
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
  const db = useDb()

  try {
    const attachment = await getMessageAttachment(db, conversationId, messageId, fileId)
    const file = attachment.mimeType.startsWith('image/')
      ? await resolveImageDisplayPreview(db, fileId)
      : attachment

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
      throw apiError(event, 'NOT_FOUND', 'Attachment not found')
    }
    throw err
  }
})
