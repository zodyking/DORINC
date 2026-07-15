import { useDb } from '../../../db/client'
import {
  MessagesServiceError,
  parseEntityRefsFromBody,
  sendMessage,
} from '../../../services/messages.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { sendMessageSchema } from '../../../../shared/validators/messages'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'messages.send.own')
  const { id } = validateParams(event, idParamSchema)
  const body = validateBody(event, sendMessageSchema)

  const refs = body.entityRefs?.length ? body.entityRefs : parseEntityRefsFromBody(body.body)

  try {
    return await sendMessage(useDb(), id, user.id, body.body, refs)
  }
  catch (e) {
    if (e instanceof MessagesServiceError) {
      const message = e.code === 'ENTITY_NOT_FOUND'
        ? 'One or more referenced records could not be found'
        : e.code === 'FORBIDDEN'
          ? 'You do not have access to this conversation'
          : 'Could not send message'
      throw apiError(event, e.code, message)
    }
    throw e
  }
})
