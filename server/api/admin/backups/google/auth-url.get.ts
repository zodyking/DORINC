import { buildGoogleAuthUrl, GoogleDriveBackupError } from '../../../../services/google-drive-backup.service'
import { ensureMasterKeyHydrated, refreshAppConfigCache } from '../../../../services/app-config.service'
import { requirePermission } from '../../../../utils/require-permission'
import { useDb } from '../../../../db/client'
import { apiError } from '../../../../utils/api-error'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'backups.manage.all')
  const db = useDb()
  await ensureMasterKeyHydrated(db)
  await refreshAppConfigCache(db)
  try {
    return { url: buildGoogleAuthUrl(user.id) }
  }
  catch (err) {
    if (err instanceof GoogleDriveBackupError) {
      throw apiError(event, 'VALIDATION_ERROR', err.message, { reason: err.code })
    }
    throw err
  }
})
