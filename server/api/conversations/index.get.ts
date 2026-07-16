import { useDb } from '../../db/client'
import { listConversations } from '../../services/messages.service'
import { listEmailConversations } from '../../services/email-inbox.service'
import { requirePermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { conversationListQuerySchema } from '../../../shared/validators/messages'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'messages.read.own')
  const query = validateQuery(event, conversationListQuerySchema)
  const db = useDb()
  const filter = {
    userId: user.id,
    q: query.q,
    page: query.page,
    pageSize: query.pageSize,
    emailScope: query.emailScope,
  }

  if (query.channel === 'dm') {
    return listConversations(db, filter)
  }

  if (query.channel === 'email') {
    return listEmailConversations(db, filter)
  }

  const [dm, email] = await Promise.all([
    listConversations(db, { ...filter, page: 1, pageSize: 200 }),
    listEmailConversations(db, { ...filter, page: 1, pageSize: 200 }),
  ])

  const merged = [...dm.items, ...email.items]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  const offset = (query.page - 1) * query.pageSize
  return {
    items: merged.slice(offset, offset + query.pageSize),
    total: merged.length,
    page: query.page,
    pageSize: query.pageSize,
  }
})
