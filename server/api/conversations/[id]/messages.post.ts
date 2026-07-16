import { useDb } from '../../../db/client'
import {
  MessagesServiceError,
  parseEntityRefsFromBody,
  sendMessage,
} from '../../../services/messages.service'
import {
  EmailInboxError,
  getConversationType,
  replyToEmailThread,
} from '../../../services/email-inbox.service'
import { throwMessagesApiError } from '../../../utils/messages-api-errors'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { sendMessageSchema } from '../../../../shared/validators/messages'
import { emailReplySchema } from '../../../../shared/validators/email-inbox'
import { apiError } from '../../../utils/api-error'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'messages.send.own')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  const type = await getConversationType(db, id)
  if (!type) throw apiError(event, 'NOT_FOUND', 'Conversation not found')

  if (type === 'email') {
    const body = await validateBody(event, emailReplySchema)
    try {
      return await replyToEmailThread(db, id, user.id, body.body)
    }
    catch (err) {
      if (err instanceof EmailInboxError) {
        if (err.code === 'NOT_CONFIGURED') throw apiError(event, 'SERVICE_UNAVAILABLE', 'SMTP is not configured')
        if (err.code === 'SEND_FAILED') throw apiError(event, 'UPSTREAM_ERROR', 'Email could not be sent')
        if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Conversation not found')
      }
      throw err
    }
  }

  const body = await validateBody(event, sendMessageSchema)
  const refs = body.entityRefs?.length ? body.entityRefs : parseEntityRefsFromBody(body.body)

  try {
    return await sendMessage(db, id, user.id, body.body, refs)
  }
  catch (e) {
    if (e instanceof MessagesServiceError) {
      throwMessagesApiError(
        event,
        e,
        e.code === 'ENTITY_NOT_FOUND'
          ? 'One or more referenced records could not be found'
          : 'Could not send message',
      )
    }
    throw e
  }
})
