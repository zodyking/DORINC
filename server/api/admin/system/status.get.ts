import { getSystemStatus } from '../../../services/system-admin.service'
import { requirePermission } from '../../../utils/require-permission'
import { useDb } from '../../../db/client'
import { refreshAppConfigCache } from '../../../services/app-config.service'
import { refreshImapConfigCache } from '../../../services/imap-config.service'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const db = useDb()
  await refreshAppConfigCache(db)
  await refreshImapConfigCache(db)
  return getSystemStatus(db)
})
