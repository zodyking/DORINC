import { useDb } from '../../../db/client'
import { getConversationDetail } from '../../../services/messages.service'
import { apiError } from '../../../utils/api-error'
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
    if ((e as { code?: string }).code === 'FORBIDDEN') {
      throw apiError(event, 'FORBIDDEN', 'You do not have access to this conversation')
    }
    if ((e as { code?: string }).code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Conversation not found')
    }
    throw e
  }
})
