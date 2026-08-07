import { sendDailySummaryReport } from '../../../services/daily-summary.service'
import { requirePermission } from '../../../utils/require-permission'
import { useDb } from '../../../db/client'
import { apiError } from '../../../utils/api-error'
import { ensureMasterKeyHydrated, refreshAppConfigCache } from '../../../services/app-config.service'

/** Manual trigger — delivers via SMTP immediately (same path as SMTP test). */
export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'system.admin.all')
  const db = useDb()
  await ensureMasterKeyHydrated(db)
  await refreshAppConfigCache(db)

  try {
    const result = await sendDailySummaryReport(db, {
      force: true,
      delivery: 'direct',
      actor: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    })
    return result
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Daily summary failed'
    throw apiError(event, 'INTERNAL_ERROR', message)
  }
})
