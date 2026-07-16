import { and, eq, isNull, lt } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { EditableEntityType } from '../db/schema/editing-sessions'
import { editingSessions } from '../db/schema/editing-sessions'

/** Stale after 90s without heartbeat (SPEC §12: 60–120s). */
export const EDIT_SESSION_STALE_MS = 90_000

export type EditingSessionsServiceErrorCode
  = 'NOT_FOUND' | 'SESSION_ACTIVE' | 'SESSION_REQUIRED' | 'NOT_HOLDER'

export class EditingSessionsServiceError extends Error {
  constructor(
    public readonly code: EditingSessionsServiceErrorCode,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(code)
  }
}

function staleBefore(): Date {
  return new Date(Date.now() - EDIT_SESSION_STALE_MS)
}

export async function purgeStaleEditingSessions(
  db: Db,
  entityType: EditableEntityType,
  entityId: string,
) {
  await db.update(editingSessions)
    .set({ releasedAt: new Date() })
    .where(and(
      eq(editingSessions.entityType, entityType),
      eq(editingSessions.entityId, entityId),
      isNull(editingSessions.releasedAt),
      lt(editingSessions.lastHeartbeatAt, staleBefore()),
    ))
}

export async function getActiveEditingSession(
  db: Db,
  entityType: EditableEntityType,
  entityId: string,
) {
  await purgeStaleEditingSessions(db, entityType, entityId)

  const [row] = await db.select().from(editingSessions)
    .where(and(
      eq(editingSessions.entityType, entityType),
      eq(editingSessions.entityId, entityId),
      isNull(editingSessions.releasedAt),
    ))
    .limit(1)

  return row ?? null
}

export async function acquireEditingSession(
  db: Db,
  entityType: EditableEntityType,
  entityId: string,
  userId: string,
  userName: string,
) {
  await purgeStaleEditingSessions(db, entityType, entityId)

  const active = await getActiveEditingSession(db, entityType, entityId)
  if (active) {
    if (active.userId === userId) {
      const [updated] = await db.update(editingSessions)
        .set({ lastHeartbeatAt: new Date() })
        .where(eq(editingSessions.id, active.id))
        .returning()
      return updated!
    }
    throw new EditingSessionsServiceError('SESSION_ACTIVE', {
      editorName: active.userNameSnapshot,
      editorUserId: active.userId,
      sessionId: active.id,
    })
  }

  const [session] = await db.insert(editingSessions).values({
    entityType,
    entityId,
    userId,
    userNameSnapshot: userName,
  }).returning()

  return session!
}

export async function heartbeatEditingSession(db: Db, sessionId: string, userId: string) {
  const [row] = await db.select().from(editingSessions)
    .where(and(eq(editingSessions.id, sessionId), isNull(editingSessions.releasedAt)))
  if (!row) throw new EditingSessionsServiceError('NOT_FOUND')
  if (row.userId !== userId) throw new EditingSessionsServiceError('NOT_HOLDER')

  if (row.lastHeartbeatAt < staleBefore()) {
    await db.update(editingSessions)
      .set({ releasedAt: new Date() })
      .where(eq(editingSessions.id, sessionId))
    throw new EditingSessionsServiceError('NOT_FOUND')
  }

  const [updated] = await db.update(editingSessions)
    .set({ lastHeartbeatAt: new Date() })
    .where(eq(editingSessions.id, sessionId))
    .returning()

  return updated!
}

export async function releaseEditingSession(db: Db, sessionId: string, userId: string) {
  const [row] = await db.select().from(editingSessions)
    .where(and(eq(editingSessions.id, sessionId), isNull(editingSessions.releasedAt)))
  if (!row) return { ok: true as const }
  if (row.userId !== userId) throw new EditingSessionsServiceError('NOT_HOLDER')

  await db.update(editingSessions)
    .set({ releasedAt: new Date() })
    .where(eq(editingSessions.id, sessionId))

  return { ok: true as const }
}

/** Release every active editing lock held by a user (e.g. auth sign-out). */
export async function releaseAllEditingSessionsForUser(db: Db, userId: string) {
  await db.update(editingSessions)
    .set({ releasedAt: new Date() })
    .where(and(
      eq(editingSessions.userId, userId),
      isNull(editingSessions.releasedAt),
    ))
  return { ok: true as const }
}

/** Admin force-release — breaks another user's lock (SPEC §12). */
export async function adminForceReleaseEditingSession(
  db: Db,
  sessionId: string,
  adminUserId: string,
  reason: string,
) {
  const [row] = await db.select().from(editingSessions)
    .where(and(eq(editingSessions.id, sessionId), isNull(editingSessions.releasedAt)))
  if (!row) throw new EditingSessionsServiceError('NOT_FOUND')

  await db.update(editingSessions)
    .set({ releasedAt: new Date() })
    .where(eq(editingSessions.id, sessionId))

  return {
    ok: true as const,
    releasedSession: {
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      holderUserId: row.userId,
      holderUserName: row.userNameSnapshot,
      adminUserId,
      reason,
    },
  }
}

/** Mutations require the caller to hold an active, non-stale session. */
export async function assertEditingSessionHolder(
  db: Db,
  entityType: EditableEntityType,
  entityId: string,
  userId: string,
) {
  const active = await getActiveEditingSession(db, entityType, entityId)
  if (!active) {
    throw new EditingSessionsServiceError('SESSION_REQUIRED')
  }
  if (active.userId !== userId) {
    throw new EditingSessionsServiceError('SESSION_ACTIVE', {
      editorName: active.userNameSnapshot,
      editorUserId: active.userId,
    })
  }
}
