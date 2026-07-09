import { listAiUsageLogs } from '../../../../services/ai-jobs.service'
import { requirePermission } from '../../../../utils/require-permission'
import { useDb } from '../../../../db/client'
import { validateQuery } from '../../../../utils/validate'
import { aiUsageLogsQuerySchema } from '../../../../../shared/validators/ai'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'ai.admin.all')
  const query = validateQuery(event, aiUsageLogsQuerySchema)
  const result = await listAiUsageLogs(useDb(), query)
  return {
    items: result.items.map(item => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })),
    total: result.total,
  }
})
