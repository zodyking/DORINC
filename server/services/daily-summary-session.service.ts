import { randomUUID } from 'node:crypto'
import type { DailySummaryReport, DailySummarySection } from './daily-summary.service'

const SESSION_TTL_MS = 15 * 60 * 1000

export interface DailySummarySessionActor {
  id: string
  name: string
  email: string
}

export interface DailySummarySession {
  id: string
  actor: DailySummarySessionActor
  report: DailySummaryReport
  createdAt: number
  expiresAt: number
}

const sessions = new Map<string, DailySummarySession>()

function pruneExpiredSessions(now = Date.now()) {
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id)
  }
}

export function createDailySummarySession(
  actor: DailySummarySessionActor,
  report: DailySummaryReport,
): DailySummarySession {
  pruneExpiredSessions()
  const now = Date.now()
  const session: DailySummarySession = {
    id: randomUUID(),
    actor,
    report,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  }
  sessions.set(session.id, session)
  return session
}

export function getDailySummarySession(sessionId: string): DailySummarySession | null {
  pruneExpiredSessions()
  const session = sessions.get(sessionId)
  if (!session) return null
  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId)
    return null
  }
  return session
}

export function updateDailySummarySessionReport(
  sessionId: string,
  report: DailySummaryReport,
): DailySummarySession | null {
  const session = getDailySummarySession(sessionId)
  if (!session) return null
  session.report = report
  session.expiresAt = Date.now() + SESSION_TTL_MS
  return session
}

export function deleteDailySummarySession(sessionId: string) {
  sessions.delete(sessionId)
}

export function listSusanSteps(report: DailySummaryReport): Array<{ id: string, title: string }> {
  return report.sections.map((section: DailySummarySection) => ({
    id: section.id,
    title: section.title,
  }))
}
