import { getBackupIntegrationView } from '../../../../services/google-drive-backup.service'
import { getBackupSettings } from '../../../../services/backups.service'
import { requirePermission } from '../../../../utils/require-permission'
import { useDb } from '../../../../db/client'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'backups.manage.all')
  const db = useDb()
  const [integration, settings] = await Promise.all([
    getBackupIntegrationView(db),
    getBackupSettings(db),
  ])
  return { integration, settings }
})
