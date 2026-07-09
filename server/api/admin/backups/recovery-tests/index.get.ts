import { listRecoveryTests } from '../../../../services/backups.service'
import { useDb } from '../../../../db/client'
import { requirePermission } from '../../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const items = await listRecoveryTests(useDb(), 20)

  return {
    items: items.map(item => ({
      id: item.id,
      backupRunId: item.backupRunId,
      status: item.status,
      valid: item.valid,
      tocEntries: item.tocEntries,
      errorMessage: item.errorMessage,
      testedBy: item.testedBy,
      startedAt: item.startedAt,
      finishedAt: item.finishedAt,
      createdAt: item.createdAt,
    })),
  }
})
