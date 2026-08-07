import { z } from 'zod'
import { requirePermission } from '../../../../utils/require-permission'
import { useDb } from '../../../../db/client'
import { apiError } from '../../../../utils/api-error'
import { ensureMasterKeyHydrated, refreshAppConfigCache } from '../../../../services/app-config.service'
import { deliverDailySummaryReport } from '../../../../services/daily-summary.service'
import {
  deleteDailySummarySession,
  getDailySummarySession,
} from '../../../../services/daily-summary-session.service'

const bodySchema = z.object({
  sessionId: z.string().uuid(),
})

/** Send a prepared progressive daily-summary session to the current admin only. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const auth = event.context.auth as { user: { id: string, name: string, email: string } }
  const db = useDb()
  await ensureMasterKeyHydrated(db)
  await refreshAppConfigCache(db)

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw apiError(event, 'VALIDATION_ERROR', 'Invalid send request')
  }

  const session = getDailySummarySession(parsed.data.sessionId)
  if (!session) {
    throw apiError(event, 'NOT_FOUND', 'Daily summary session expired. Start the test again.')
  }
  if (session.actor.id !== auth.user.id) {
    throw apiError(event, 'FORBIDDEN', 'This daily summary session belongs to another user')
  }

  try {
    let report = session.report
    if (report.susanGenerated > 0) {
      report = { ...report, susanSkippedReason: null }
    }
    else if (report.susanFailed > 0) {
      const existing = report.susanSkippedReason?.trim() || ''
      report = {
        ...report,
        susanSkippedReason: existing.startsWith('Susan calls failed')
          ? existing
          : `Susan calls failed (${report.susanFailed})${existing ? `: ${existing}` : ''}`,
      }
    }

    const result = await deliverDailySummaryReport(db, report, {
      force: true,
      delivery: 'direct',
      recipientsMode: 'actor',
      actor: session.actor,
    })
    deleteDailySummarySession(session.id)
    return result
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Daily summary send failed'
    throw apiError(event, 'INTERNAL_ERROR', message)
  }
})
