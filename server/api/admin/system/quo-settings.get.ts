import { useDb } from '../../../db/client'
import { getQuoSettingsView, refreshQuoConfigCache } from '../../../services/quo.service'
import { requirePermission } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const db = useDb()
  await refreshQuoConfigCache(db)
  return getQuoSettingsView(db)
})
