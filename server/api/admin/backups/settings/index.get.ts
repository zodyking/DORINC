import { getBackupSettings } from '../../../../services/backups.service'
import { requirePermission } from '../../../../utils/require-permission'
import { useDb } from '../../../../db/client'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'backups.manage.all')
  return getBackupSettings(useDb())
})
