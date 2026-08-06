import {
  connectGoogleDrive,
  GoogleDriveBackupError,
  verifyOAuthState,
} from '../../../../services/google-drive-backup.service'
import { ensureMasterKeyHydrated, refreshAppConfigCache } from '../../../../services/app-config.service'
import { requirePermission } from '../../../../utils/require-permission'
import { useDb } from '../../../../db/client'
import { apiError } from '../../../../utils/api-error'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'backups.manage.all')
  const db = useDb()
  await ensureMasterKeyHydrated(db)
  await refreshAppConfigCache(db)

  const query = getQuery(event)
  const code = String(query.code ?? '')
  const state = String(query.state ?? '')
  const oauthError = query.error ? String(query.error) : null

  if (oauthError) {
    return sendRedirect(event, `/admin?backup_oauth=denied`)
  }
  if (!code || !state) {
    throw apiError(event, 'VALIDATION_ERROR', 'Missing OAuth code or state')
  }
  if (!verifyOAuthState(state, user.id)) {
    throw apiError(event, 'VALIDATION_ERROR', 'Invalid or expired OAuth state')
  }

  try {
    await connectGoogleDrive(db, code, user.id, event)
    return sendRedirect(event, '/admin?backup_oauth=connected')
  }
  catch (err) {
    if (err instanceof GoogleDriveBackupError) {
      return sendRedirect(event, `/admin?backup_oauth=error&reason=${encodeURIComponent(err.message)}`)
    }
    throw err
  }
})
