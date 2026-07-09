import { GoogleDriveBackupError, testGoogleDriveConnection } from '../../../services/google-drive-backup.service'
import { requirePermission } from '../../../utils/require-permission'
import { useDb } from '../../../db/client'
import { apiError } from '../../../utils/api-error'
import { writeAudit } from '../../../services/audit.service'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'backups.manage.all')
  const db = useDb()

  await writeAudit(event, {
    entityType: 'backup',
    action: 'backup.google_drive.test_requested',
    permissionKey: 'backups.manage.all',
    riskLevel: 'normal',
  })

  try {
    const result = await testGoogleDriveConnection(db)
    return result
  }
  catch (err) {
    if (err instanceof GoogleDriveBackupError) {
      const code = err.code === 'NOT_CONNECTED' || err.code === 'NOT_CONFIGURED'
        ? 'VALIDATION_ERROR'
        : 'INTERNAL_ERROR'
      throw apiError(event, code, err.message, { reason: err.code })
    }
    throw err
  }
})
