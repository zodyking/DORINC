import { useDb } from '../../db/client'
import {
  createOrGetDmConversation,
  MessagesServiceError,
} from '../../services/messages.service'
import { apiError } from '../../utils/api-error'
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
      const code = e.code === 'SELF_DM' ? 'VALIDATION_ERROR' : e.code
      const message = e.code === 'SELF_DM'
        ? 'You cannot message yourself'
        : e.code === 'INVALID_PARTICIPANT'
          ? 'That user cannot receive messages'
          : 'Could not start conversation'
      throw apiError(event, code, message)
    }
    throw e
  }
})
