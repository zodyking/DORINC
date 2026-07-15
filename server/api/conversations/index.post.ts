import { useDb } from '../../db/client'
import {
  createOrGetDmConversation,
  MessagesServiceError,
} from '../../services/messages.service'
import { throwMessagesApiError } from '../../utils/messages-api-errors'
import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { createConversationSchema } from '../../../shared/validators/messages'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'messages.send.own')
  const body = validateBody(event, createConversationSchema)

  try {
    return await createOrGetDmConversation(useDb(), user.id, body.participantUserId)
  }
  catch (e) {
    if (e instanceof MessagesServiceError) {
      throwMessagesApiError(event, e, 'Could not start conversation')
    }
    throw e
  }
})
