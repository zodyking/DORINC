import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { sessions, users } from '../db/schema/auth'
import { verifyPassword } from '../auth/password'

export const STEP_UP_TTL_MS = 10 * 60 * 1000 // 10 minutes

export type StepUpErrorCode = 'INVALID_PASSWORD' | 'SESSION_NOT_FOUND'

export class StepUpError extends Error {
  constructor(public readonly code: StepUpErrorCode) {
    super(code)
  }
}

export function isStepUpValid(stepUpVerifiedAt: Date | null | undefined, now = Date.now()): boolean {
  if (!stepUpVerifiedAt) return false
  return now - stepUpVerifiedAt.getTime() <= STEP_UP_TTL_MS
}

export function stepUpExpiresAt(stepUpVerifiedAt: Date | null | undefined): Date | null {
  if (!stepUpVerifiedAt) return null
  return new Date(stepUpVerifiedAt.getTime() + STEP_UP_TTL_MS)
}

export async function verifyStepUp(
  db: Db,
  userId: string,
  sessionId: string,
  password: string,
): Promise<Date> {
  const [row] = await db
    .select({ passwordHash: users.passwordHash, sessionId: sessions.id })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1)

  if (!row || row.sessionId !== sessionId) throw new StepUpError('SESSION_NOT_FOUND')

  const ok = await verifyPassword(row.passwordHash, password)
  if (!ok) throw new StepUpError('INVALID_PASSWORD')

  const verifiedAt = new Date()
  await db.update(sessions)
    .set({ stepUpVerifiedAt: verifiedAt })
    .where(eq(sessions.id, sessionId))

  return verifiedAt
}

export async function getStepUpStatus(
  db: Db,
  sessionId: string,
): Promise<{ verified: boolean, expiresAt: Date | null }> {
  const [row] = await db.select({ stepUpVerifiedAt: sessions.stepUpVerifiedAt })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1)

  const verified = isStepUpValid(row?.stepUpVerifiedAt ?? null)
  return {
    verified,
    expiresAt: verified ? stepUpExpiresAt(row!.stepUpVerifiedAt) : null,
  }
}

export async function clearStepUp(db: Db, sessionId: string): Promise<void> {
  await db.update(sessions)
    .set({ stepUpVerifiedAt: null })
    .where(eq(sessions.id, sessionId))
}
