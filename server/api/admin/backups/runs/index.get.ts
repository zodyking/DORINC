import { listBackupRuns } from '../../../../services/backups.service'
import { requirePermission } from '../../../../utils/require-permission'
import { useDb } from '../../../../db/client'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'backups.manage.all')
  const query = getQuery(event)
  const limit = Math.min(50, Math.max(1, Number(query.limit ?? 20)))
  const runs = await listBackupRuns(useDb(), limit)
  return { items: runs }
})
