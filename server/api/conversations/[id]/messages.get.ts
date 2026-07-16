import { useDb } from '../../../db/client'
import { listMessages } from '../../../services/messages.service'
import { getConversationType, listEmailMessages } from '../../../services/email-inbox.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams, validateQuery } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { messageListQuerySchema } from '../../../../shared/validators/messages'
import { apiError } from '../../../utils/api-error'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'messages.read.own')
  const { id } = validateParams(event, idParamSchema)
  const query = validateQuery(event, messageListQuerySchema)
  const db = useDb()

  const type = await getConversationType(db, id)
  if (!type) throw apiError(event, 'NOT_FOUND', 'Conversation not found')

  if (type === 'email') {
    return listEmailMessages(db, id, {
      page: query.page,
      pageSize: query.pageSize,
      afterId: query.afterId,
    })
  }

  return listMessages(db, {
    conversationId: id,
    userId: user.id,
    page: query.page,
    pageSize: query.pageSize,
    afterId: query.afterId,
  })
})
