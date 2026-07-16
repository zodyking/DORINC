import { useDb } from '../../db/client'
import { getUnreadCount } from '../../services/messages.service'
import { countEmailUnread } from '../../services/email-inbox.service'
import { requirePermission } from '../../utils/require-permission'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'messages.read.own')
  const db = useDb()
  const [dmCount, emailCount] = await Promise.all([
    getUnreadCount(db, user.id),
    countEmailUnread(db, user.id),
  ])
  return { count: dmCount + emailCount }
})
