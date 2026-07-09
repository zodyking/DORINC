import {
  BackupsServiceError,
  restoreBackupFromRun,
} from '../../../../services/backups.service'
import { clearStepUp, verifyStepUp, StepUpError } from '../../../../services/step-up.service'
import { recordBackupRestoreAlert } from '../../../../services/suspicious-activity.service'
import { writeAudit } from '../../../../services/audit.service'
import { useDb } from '../../../../db/client'
import { apiError } from '../../../../utils/api-error'
import { rateLimitKeyFromUser, requireRateLimit } from '../../../../utils/require-rate-limit'
import { requirePermission } from '../../../../utils/require-permission'
import { requireStepUp, requireSuperAdmin } from '../../../../utils/require-step-up'
import { validateBody, validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'
import { backupRestoreSchema } from '../../../../../shared/validators/security'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'system.admin.all')
  requireSuperAdmin(event, user)
  await requireRateLimit(event, 'backup', rateLimitKeyFromUser(user.id))

  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, backupRestoreSchema)

  const auth = event.context.auth as { sessionId?: string, stepUpVerifiedAt?: Date | null } | undefined
  if (!auth?.sessionId) throw apiError(event, 'UNAUTHENTICATED', 'Not signed in')

  try {
    const verifiedAt = await verifyStepUp(useDb(), user.id, auth.sessionId, body.password)
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
    entityId: id,
    action: 'backup.restore_requested',
    afterData: { reason: body.reason },
    permissionKey: 'system.admin.all',
    riskLevel: 'high',
  })

  const db = useDb()

  try {
    const result = await restoreBackupFromRun(db, id, {
      id: user.id,
      name: user.name,
      email: user.email,
      accountType: user.accountType,
    }, body.reason, event)

    await recordBackupRestoreAlert(db, { id: user.id, email: user.email }, id, body.reason)
    await clearStepUp(db, auth.sessionId)

    return {
      ok: true,
      safetyBackupRunId: result.safetyBackupRunId,
      restoredFromRunId: result.restoredFromRunId,
      restoredFilename: result.restoredFilename,
    }
  }
  catch (err) {
    if (err instanceof BackupsServiceError) {
      const message = err.code === 'NOT_FOUND'
        ? 'Backup run not found or not completed'
        : 'Database restore failed'
      throw apiError(event, err.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_ERROR', message, { reason: err.code })
    }
    throw err
  }
})
