import { useDb } from '../../db/client'
import { startEmailThread, EmailInboxError } from '../../services/email-inbox.service'
import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { apiError } from '../../utils/api-error'
import { startEmailThreadSchema } from '../../../shared/validators/email-inbox'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'messages.send.own')
  const body = await validateBody(event, startEmailThreadSchema)

  try {
    return await startEmailThread(useDb(), user.id, body)
  }
  catch (err) {
    if (err instanceof EmailInboxError) {
      if (err.code === 'NOT_CONFIGURED') throw apiError(event, 'SERVICE_UNAVAILABLE', 'SMTP is not configured')
      if (err.code === 'INVALID_RECIPIENT') throw apiError(event, 'VALIDATION_ERROR', 'That customer does not have an email address on file')
      if (err.code === 'SEND_FAILED') throw apiError(event, 'UPSTREAM_ERROR', 'Email could not be sent')
    }
    throw err
  }
})
