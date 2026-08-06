import { useDb } from '../../../db/client'
import { listAnnouncementsAdmin } from '../../../services/announcements.service'
import { requirePermission } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const db = useDb()
  const items = await listAnnouncementsAdmin(db)
  return { items }
})
