import {
  BackupsServiceError,
  runRecoveryTest,
} from '../../../../services/backups.service'
import { writeAudit } from '../../../../services/audit.service'
import { useDb } from '../../../../db/client'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'system.admin.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    const test = await runRecoveryTest(db, id, {
      id: user.id,
      name: user.name,
      email: user.email,
      accountType: user.accountType,
    })

    await writeAudit(event, {
      entityType: 'backup',
      entityId: id,
      action: 'backup.recovery_test',
      afterData: {
        testId: test.id,
        valid: test.valid,
        tocEntries: test.tocEntries,
      },
      permissionKey: 'system.admin.all',
      riskLevel: 'sensitive',
    })

    return {
      id: test.id,
      backupRunId: test.backupRunId,
      status: test.status,
      valid: test.valid,
      tocEntries: test.tocEntries,
      finishedAt: test.finishedAt,
    }
  }
  catch (err) {
    if (err instanceof BackupsServiceError) {
      if (err.code === 'NOT_FOUND') {
        throw apiError(event, 'NOT_FOUND', 'Backup run not found or not completed')
      }
      throw apiError(event, 'INTERNAL_ERROR', 'Recovery test failed', { reason: err.code })
    }
    throw err
  }
})
