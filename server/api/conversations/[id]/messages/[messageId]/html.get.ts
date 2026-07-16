import { useDb } from '../../../../../db/client'
import { EmailInboxError, getEmailMessageHtml } from '../../../../../services/email-inbox.service'
import { requirePermission } from '../../../../../utils/require-permission'
import { validateParams } from '../../../../../utils/validate'
import { idParamSchema } from '../../../../../../shared/validators/common'
import { apiError } from '../../../../../utils/api-error'
import { z } from 'zod'

const paramsSchema = idParamSchema.extend({
  messageId: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'messages.read.own')
  const { id, messageId } = validateParams(event, paramsSchema)
  const db = useDb()

  try {
    return await getEmailMessageHtml(db, id, messageId)
  }
  catch (e) {
    if (e instanceof EmailInboxError && e.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Message not found')
    }
    throw e
  }
})
