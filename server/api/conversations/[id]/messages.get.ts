import { useDb } from '../../../db/client'
import { listMessages } from '../../../services/messages.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams, validateQuery } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { messageListQuerySchema } from '../../../../shared/validators/messages'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'messages.read.own')
  const { id } = validateParams(event, idParamSchema)
  const query = validateQuery(event, messageListQuerySchema)

  return listMessages(useDb(), {
    conversationId: id,
    userId: user.id,
    page: query.page,
    pageSize: query.pageSize,
    afterId: query.afterId,
  })
})
