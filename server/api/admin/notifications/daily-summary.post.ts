import { sendDailySummaryReport } from '../../../services/daily-summary.service'
import { requirePermission } from '../../../utils/require-permission'
import { useDb } from '../../../db/client'
import { apiError } from '../../../utils/api-error'

/** Manual trigger for admins — queues the daily summary immediately. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  try {
    const result = await sendDailySummaryReport(useDb(), { force: true })
    return result
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Daily summary failed'
    throw apiError(event, 'INTERNAL_ERROR', message)
  }
})
