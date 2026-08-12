import { and, eq, gt, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import { appSettings } from '../db/schema/settings'
import { sessions } from '../db/schema/auth'
import {
  SESSION_TERMINATION_SETTINGS_KEY,
  type SessionTerminationRecord,
  isSessionTerminationActive,
} from '../../shared/session-termination'

export async function revokeAllActiveSessions(db: Db): Promise<number> {
  const now = new Date()
  const rows = await db.update(sessions)
    .set({ revokedAt: now })
    .where(and(
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, now),
    ))
    .returning({ id: sessions.id })
  return rows.length
}

export async function recordSessionTermination(
  db: Db,
  input: {
    byUserId: string
    byName: string
    byEmail: string
    revokedCount: number
  },
): Promise<SessionTerminationRecord> {
  const record: SessionTerminationRecord = {
    at: new Date().toISOString(),
    byUserId: input.byUserId,
    byName: input.byName,
    byEmail: input.byEmail,
    revokedCount: input.revokedCount,
  }

  const [existing] = await db.select({ id: appSettings.id })
    .from(appSettings)
    .where(eq(appSettings.key, SESSION_TERMINATION_SETTINGS_KEY))
    .limit(1)

  if (existing) {
    await db.update(appSettings)
      .set({ value: record, updatedBy: input.byUserId, updatedAt: new Date() })
      .where(eq(appSettings.key, SESSION_TERMINATION_SETTINGS_KEY))
  }
  else {
    await db.insert(appSettings).values({
      key: SESSION_TERMINATION_SETTINGS_KEY,
      value: record,
      updatedBy: input.byUserId,
    })
  }

  return record
}

export async function getSessionTerminationRecord(db: Db): Promise<SessionTerminationRecord | null> {
  const [row] = await db.select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, SESSION_TERMINATION_SETTINGS_KEY))
    .limit(1)
  const value = row?.value as SessionTerminationRecord | null | undefined
  if (!value?.at) return null
  return value
}

export async function getActiveSessionTermination(db: Db): Promise<SessionTerminationRecord | null> {
  const record = await getSessionTerminationRecord(db)
  return isSessionTerminationActive(record) ? record : null
}
