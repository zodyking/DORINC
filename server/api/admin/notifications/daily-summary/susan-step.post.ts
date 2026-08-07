import { z } from 'zod'
import { requirePermission } from '../../../../utils/require-permission'
import { useDb } from '../../../../db/client'
import { apiError } from '../../../../utils/api-error'
import { ensureMasterKeyHydrated, refreshAppConfigCache } from '../../../../services/app-config.service'
import { refreshSusanUsageSectionInReport } from '../../../../services/daily-summary.service'
import {
  getDailySummarySession,
  updateDailySummarySessionReport,
} from '../../../../services/daily-summary-session.service'
import {
  generateSusanSectionInsight,
  prepareSusanClient,
} from '../../../../services/daily-summary-susan.service'

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  sectionId: z.string().trim().min(1).max(64),
  stepIndex: z.number().int().min(1).optional(),
  totalSteps: z.number().int().min(1).optional(),
})

/** Run exactly one Susan OpenRouter call for a prepared daily-summary section. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const auth = event.context.auth as { user: { id: string } }
  const db = useDb()
  await ensureMasterKeyHydrated(db)
  await refreshAppConfigCache(db)

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw apiError(event, 'VALIDATION_ERROR', 'Invalid Susan step request')
  }

  const session = getDailySummarySession(parsed.data.sessionId)
  if (!session) {
    throw apiError(event, 'NOT_FOUND', 'Daily summary session expired. Start the test again.')
  }
  if (session.actor.id !== auth.user.id) {
    throw apiError(event, 'FORBIDDEN', 'This daily summary session belongs to another user')
  }

  let report = session.report
  const section = report.sections.find(s => s.id === parsed.data.sectionId)
  if (!section) {
    throw apiError(event, 'NOT_FOUND', `Unknown section: ${parsed.data.sectionId}`)
  }

  const prepared = await prepareSusanClient(db)
  if (!prepared.ok) {
    report = {
      ...report,
      susanFailed: report.susanFailed + 1,
      susanSkippedReason: prepared.reason,
    }
    updateDailySummarySessionReport(session.id, report)
    return {
      sectionId: section.id,
      title: section.title,
      ok: false,
      usedDraft: true,
      error: prepared.reason,
      insight: section.insight,
      susanGenerated: report.susanGenerated,
      susanFailed: report.susanFailed,
      stepIndex: parsed.data.stepIndex ?? null,
      totalSteps: parsed.data.totalSteps ?? report.sections.length,
    }
  }

  if (section.id === 'susan') {
    report = await refreshSusanUsageSectionInReport(db, report)
  }

  const current = report.sections.find(s => s.id === parsed.data.sectionId)!
  const result = await generateSusanSectionInsight(db, {
    client: prepared.client,
    section: current,
    createdBy: session.actor.id,
  })

  const insight = result.insight
  const usedDraft = insight.trim() === current.insight.trim()
  const nextGenerated = report.susanGenerated + (usedDraft ? 0 : 1)
  const nextFailed = report.susanFailed + (usedDraft ? 1 : 0)

  report = {
    ...report,
    sections: report.sections.map(s => (
      s.id === current.id ? { ...s, insight } : s
    )),
    susanGenerated: nextGenerated,
    susanFailed: nextFailed,
    susanEnabled: report.susanEnabled || !usedDraft,
    susanSkippedReason: usedDraft
      ? (result.error || report.susanSkippedReason || 'Susan returned an empty note')
      : (nextGenerated > 0 ? null : report.susanSkippedReason),
  }

  // Refresh usage totals after each successful AI call so the Susan usage card stays current.
  if (!usedDraft) {
    const preservedInsight = current.id === 'susan' ? insight : null
    report = await refreshSusanUsageSectionInReport(db, report)
    if (preservedInsight) {
      report = {
        ...report,
        sections: report.sections.map(s => (
          s.id === 'susan' ? { ...s, insight: preservedInsight } : s
        )),
      }
    }
    report = {
      ...report,
      susanSkippedReason: report.susanGenerated > 0 ? null : report.susanSkippedReason,
    }
  }

  updateDailySummarySessionReport(session.id, report)

  return {
    sectionId: current.id,
    title: current.title,
    ok: !usedDraft,
    usedDraft,
    error: result.error,
    insight,
    susanGenerated: report.susanGenerated,
    susanFailed: report.susanFailed,
    stepIndex: parsed.data.stepIndex ?? null,
    totalSteps: parsed.data.totalSteps ?? report.sections.length,
  }
})
