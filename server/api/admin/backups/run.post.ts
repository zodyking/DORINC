import { BackupsServiceError, runManualBackup } from '../../../services/backups.service'
import { writeAudit } from '../../../services/audit.service'
import { useDb } from '../../../db/client'
import { apiError } from '../../../utils/api-error'
import { rateLimitKeyFromUser, requireRateLimit } from '../../../utils/require-rate-limit'
import { requirePermission } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'backups.manage.all')
  await requireRateLimit(event, 'backup', rateLimitKeyFromUser(user.id))
  const db = useDb()

  await writeAudit(event, {
    entityType: 'backup',
    action: 'backup.manual_requested',
    permissionKey: 'backups.manage.all',
    riskLevel: 'sensitive',
  })

  try {
    const run = await runManualBackup(db, {
      id: user.id,
      name: user.name,
      email: user.email,
      accountType: user.accountType,
    }, event)

    return {
      id: run.id,
      filename: run.filename,
      status: run.status,
      encryptedBytes: run.encryptedBytes,
      sha256Checksum: run.sha256Checksum,
      finishedAt: run.finishedAt,
    }
  }
  catch (err) {
    if (err instanceof BackupsServiceError) {
      const code = err.code === 'KEY_MISSING' ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR'
      throw apiError(event, code, err.code === 'KEY_MISSING'
        ? 'ENCRYPTION_MASTER_KEY must be configured before running backups'
        : 'Backup failed', { reason: err.code })
    }
    throw err
  }
})
