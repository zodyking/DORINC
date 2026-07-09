import { disconnectGoogleDrive } from '../../../../services/google-drive-backup.service'
import { requirePermission } from '../../../../utils/require-permission'
import { useDb } from '../../../../db/client'
import { writeAudit } from '../../../../services/audit.service'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'backups.manage.all')
  const integration = await disconnectGoogleDrive(useDb(), user.id, event)

  await writeAudit(event, {
    entityType: 'backup',
    action: 'backup.google_drive.disconnect_requested',
    permissionKey: 'backups.manage.all',
    riskLevel: 'sensitive',
  })

  return integration
})
