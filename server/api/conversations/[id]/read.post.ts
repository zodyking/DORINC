import { useDb } from '../../../db/client'
import { markConversationRead } from '../../../services/messages.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'messages.read.own')
  const { id } = validateParams(event, idParamSchema)

  return markConversationRead(useDb(), id, user.id)
})
