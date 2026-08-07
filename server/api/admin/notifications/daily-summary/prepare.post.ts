import { requirePermission } from '../../../../utils/require-permission'
import { useDb } from '../../../../db/client'
import { apiError } from '../../../../utils/api-error'
import { ensureMasterKeyHydrated, refreshAppConfigCache } from '../../../../services/app-config.service'
import { buildDailySummaryReportDraft } from '../../../../services/daily-summary.service'
import {
  createDailySummarySession,
  listSusanSteps,
} from '../../../../services/daily-summary-session.service'
import { prepareSusanClient } from '../../../../services/daily-summary-susan.service'

/** Start a progressive test send: build draft report, return Susan step list. */
export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'system.admin.all')
  const auth = event.context.auth as { user: { id: string, name: string, email: string } }
  const db = useDb()
  await ensureMasterKeyHydrated(db)
  await refreshAppConfigCache(db)

  try {
    const actor = {
      id: auth.user.id || user.id,
      name: auth.user.name,
      email: auth.user.email,
    }
    if (!actor.email?.trim()) {
      throw apiError(event, 'VALIDATION_ERROR', 'Your account needs an email address to receive the test summary')
    }

    const draft = await buildDailySummaryReportDraft(db)
    const susan = await prepareSusanClient(db)
    const report = susan.ok
      ? draft
      : { ...draft, susanSkippedReason: susan.reason }
    const session = createDailySummarySession(actor, report)
    const steps = listSusanSteps(report)

    return {
      sessionId: session.id,
      reportDate: report.reportDate,
      reportDateLabel: report.reportDateLabel,
      steps,
      susanReady: susan.ok,
      susanSkipReason: susan.ok ? null : susan.reason,
      totalSteps: steps.length,
    }
  }
  catch (err) {
    if ((err as { statusCode?: number })?.statusCode) throw err
    const message = err instanceof Error ? err.message : 'Could not prepare daily summary'
    throw apiError(event, 'INTERNAL_ERROR', message)
  }
})
