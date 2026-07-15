import { useDb } from '../../db/client'
import { getUnreadCount } from '../../services/messages.service'
import { requirePermission } from '../../utils/require-permission'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'messages.read.own')
  const count = await getUnreadCount(useDb(), user.id)
  return { count }
})
