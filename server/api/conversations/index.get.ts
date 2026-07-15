import { useDb } from '../../db/client'
import { listConversations } from '../../services/messages.service'
import { requirePermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { conversationListQuerySchema } from '../../../shared/validators/messages'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'messages.read.own')
  const query = validateQuery(event, conversationListQuerySchema)

  return listConversations(useDb(), {
    userId: user.id,
    q: query.q,
    page: query.page,
    pageSize: query.pageSize,
  })
})
