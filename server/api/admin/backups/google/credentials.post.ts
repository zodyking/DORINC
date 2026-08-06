import {
  GoogleDriveBackupError,
  saveGoogleDriveOAuthCredentials,
} from '../../../../services/google-drive-backup.service'
import { requirePermission } from '../../../../utils/require-permission'
import { useDb } from '../../../../db/client'
import { apiError } from '../../../../utils/api-error'
import { googleOAuthCredentialsSchema } from '../../../../../shared/validators/backups'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'backups.manage.all')
  const body = await readBody(event)
  const parsed = googleOAuthCredentialsSchema.safeParse(body)
  if (!parsed.success) {
    throw apiError(event, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid Google OAuth credentials')
  }

  try {
    const integration = await saveGoogleDriveOAuthCredentials(
      useDb(),
      parsed.data,
      user.id,
      event,
    )
    return { integration }
  }
  catch (err) {
    if (err instanceof GoogleDriveBackupError) {
      throw apiError(event, 'VALIDATION_ERROR', err.message, { reason: err.code })
    }
    throw err
  }
})
