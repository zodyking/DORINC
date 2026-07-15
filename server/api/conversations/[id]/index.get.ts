import { useDb } from '../../../db/client'
import { getConversationDetail, MessagesServiceError } from '../../../services/messages.service'
import { throwMessagesApiError } from '../../../utils/messages-api-errors'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'messages.read.own')
  const { id } = validateParams(event, idParamSchema)

  try {
    return await getConversationDetail(useDb(), id, user.id)
  }
  catch (e) {
    if (e instanceof MessagesServiceError) {
      throwMessagesApiError(event, e, 'Conversation not found')
    }
    throw e
  }
})
