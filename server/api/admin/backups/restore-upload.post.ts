import { readMultipartFormData } from 'h3'
import {
  BackupsServiceError,
  restoreBackupFromUploadedFile,
} from '../../../services/backups.service'
import { clearStepUp, verifyStepUp, StepUpError } from '../../../services/step-up.service'
import { recordBackupRestoreAlert } from '../../../services/suspicious-activity.service'
import { writeAudit } from '../../../services/audit.service'
import { useDb } from '../../../db/client'
import { apiError } from '../../../utils/api-error'
import { rateLimitKeyFromUser, requireRateLimit } from '../../../utils/require-rate-limit'
import { requirePermission } from '../../../utils/require-permission'
import { requireStepUp, requireSuperAdmin } from '../../../utils/require-step-up'

const MAX_UPLOAD_BYTES = 512 * 1024 * 1024 // 512 MB

/** Restore database from an uploaded encrypted backup file. */
export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'system.admin.all')
  requireSuperAdmin(event, user)
  await requireRateLimit(event, 'backup', rateLimitKeyFromUser(user.id))

  const parts = await readMultipartFormData(event)
  const filePart = parts?.find(p => p.name === 'file' && p.data?.length)
  if (!filePart?.data) {
    throw apiError(event, 'VALIDATION_ERROR', 'Upload an encrypted backup file (.dump.zst.enc)')
  }
  if (filePart.data.length > MAX_UPLOAD_BYTES) {
    throw apiError(event, 'VALIDATION_ERROR', 'Backup file is too large (max 512 MB)')
  }

  const password = parts?.find(p => p.name === 'password')?.data?.toString('utf8') ?? ''
  const reason = (parts?.find(p => p.name === 'reason')?.data?.toString('utf8') ?? '').trim()
  if (!password) throw apiError(event, 'VALIDATION_ERROR', 'Password is required')
  if (reason.length < 10) throw apiError(event, 'VALIDATION_ERROR', 'Reason must be at least 10 characters')

  const filename = filePart.filename ?? 'uploaded-backup.dump.zst.enc'
  if (!/\.enc$/i.test(filename) && !/\.zst\.enc$/i.test(filename)) {
    throw apiError(event, 'VALIDATION_ERROR', 'File must be an encrypted DORINC backup (.dump.zst.enc)')
  }

  const auth = event.context.auth as { sessionId?: string, stepUpVerifiedAt?: Date | null } | undefined
  if (!auth?.sessionId) throw apiError(event, 'UNAUTHENTICATED', 'Not signed in')

  try {
    const verifiedAt = await verifyStepUp(useDb(), user.id, auth.sessionId, password)
    auth.stepUpVerifiedAt = verifiedAt
  }
  catch (err) {
    if (err instanceof StepUpError && err.code === 'INVALID_PASSWORD') {
      throw apiError(event, 'UNAUTHENTICATED', 'Password is incorrect')
    }
    throw err
  }

  requireStepUp(event)

  await writeAudit(event, {
    entityType: 'backup',
    entityId: null,
    action: 'backup.restore_upload_requested',
    afterData: { reason, filename },
    permissionKey: 'system.admin.all',
    riskLevel: 'high',
  })

  const db = useDb()

  try {
    const result = await restoreBackupFromUploadedFile(
      db,
      Buffer.from(filePart.data),
      filename,
      {
        id: user.id,
        name: user.name,
        email: user.email,
        accountType: user.accountType,
      },
      reason,
      event,
    )

    await recordBackupRestoreAlert(db, { id: user.id, email: user.email }, result.safetyBackupRunId, reason)
    await clearStepUp(db, auth.sessionId)

    return {
      ok: true,
      safetyBackupRunId: result.safetyBackupRunId,
      restoredFilename: result.restoredFilename,
    }
  }
  catch (err) {
    if (err instanceof BackupsServiceError) {
      if (err.code === 'VERIFY_FAILED') {
        throw apiError(event, 'VALIDATION_ERROR', 'Could not decrypt backup — wrong file or encryption key')
      }
      throw apiError(event, 'INTERNAL_ERROR', 'Database restore failed', { reason: err.code })
    }
    throw err
  }
})
