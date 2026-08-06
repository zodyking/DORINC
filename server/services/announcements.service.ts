import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import {
  announcementAcknowledgements,
  announcements,
  announcementTargets,
  type AnnouncementCtaButton,
} from '../db/schema/announcements'
import { accountTypes, users } from '../db/schema/auth'
import { announcementMatchesUser, isAnnouncementInWindow } from '../../shared/announcement-gate'
import {
  normalizeAnnouncementHref,
  sanitizeAnnouncementHtml,
} from '../../shared/announcement-html'
import type {
  AnnouncementPatchInput,
  AnnouncementTargetInput,
  AnnouncementUpsertInput,
} from '../../shared/validators/announcements'

export class AnnouncementsServiceError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT',
    message: string,
  ) {
    super(message)
    this.name = 'AnnouncementsServiceError'
  }
}

export interface AnnouncementGateResult {
  locked: boolean
  pendingCount: number
  currentId: string | null
}

export interface AnnouncementPublicView {
  id: string
  title: string
  subtitle: string | null
  bodyHtml: string
  heroImageFileId: string | null
  heroImageUrl: string | null
  ctaButtons: AnnouncementCtaButton[]
  index: number
  total: number
}

function normalizeCtas(buttons: AnnouncementCtaButton[] | undefined): AnnouncementCtaButton[] {
  if (!buttons?.length) return []
  const out: AnnouncementCtaButton[] = []
  for (const button of buttons) {
    const href = normalizeAnnouncementHref(button.href)
    const label = String(button.label ?? '').trim()
    if (!href || !label) continue
    out.push({
      label: label.slice(0, 80),
      href,
      variant: button.variant ?? 'secondary',
    })
  }
  return out.slice(0, 6)
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (value == null || value === '') return null
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) {
    throw new AnnouncementsServiceError('VALIDATION', 'Invalid date')
  }
  return d
}

async function replaceTargets(
  db: Db,
  announcementId: string,
  audience: AnnouncementTargetInput,
) {
  await db.delete(announcementTargets).where(eq(announcementTargets.announcementId, announcementId))

  if (audience.targetType === 'all') {
    await db.insert(announcementTargets).values({
      announcementId,
      targetType: 'all',
    })
    return
  }

  if (audience.targetType === 'account_type') {
    const keys = [...new Set(audience.accountTypeKeys.map(k => k.trim()).filter(Boolean))]
    if (!keys.length) {
      throw new AnnouncementsServiceError('VALIDATION', 'Select at least one account type')
    }
    await db.insert(announcementTargets).values(keys.map(accountTypeKey => ({
      announcementId,
      targetType: 'account_type' as const,
      accountTypeKey,
    })))
    return
  }

  const userIds = [...new Set(audience.userIds)]
  if (!userIds.length) {
    throw new AnnouncementsServiceError('VALIDATION', 'Select at least one user')
  }
  const existing = await db.select({ id: users.id })
    .from(users)
    .where(inArray(users.id, userIds))
  if (existing.length !== userIds.length) {
    throw new AnnouncementsServiceError('VALIDATION', 'One or more selected users were not found')
  }
  await db.insert(announcementTargets).values(userIds.map(userId => ({
    announcementId,
    targetType: 'user' as const,
    userId,
  })))
}

async function loadTargetsForAnnouncements(db: Db, announcementIds: string[]) {
  if (!announcementIds.length) return new Map<string, typeof announcementTargets.$inferSelect[]>()
  const rows = await db.select().from(announcementTargets)
    .where(inArray(announcementTargets.announcementId, announcementIds))
  const map = new Map<string, typeof announcementTargets.$inferSelect[]>()
  for (const row of rows) {
    const list = map.get(row.announcementId) ?? []
    list.push(row)
    map.set(row.announcementId, list)
  }
  return map
}

export async function listPendingAnnouncementsForUser(
  db: Db,
  userId: string,
  accountTypeKey: string,
): Promise<Array<typeof announcements.$inferSelect>> {
  if (accountTypeKey === 'customer') return []

  const active = await db.select().from(announcements)
    .where(eq(announcements.isActive, true))
    .orderBy(desc(announcements.priority), asc(announcements.createdAt))

  if (!active.length) return []

  const ids = active.map(row => row.id)
  const [targetsById, acks] = await Promise.all([
    loadTargetsForAnnouncements(db, ids),
    db.select({ announcementId: announcementAcknowledgements.announcementId })
      .from(announcementAcknowledgements)
      .where(and(
        eq(announcementAcknowledgements.userId, userId),
        inArray(announcementAcknowledgements.announcementId, ids),
      )),
  ])

  const ackSet = new Set(acks.map(row => row.announcementId))
  const now = new Date()

  return active.filter((row) => {
    if (ackSet.has(row.id)) return false
    if (!isAnnouncementInWindow({ startsAt: row.startsAt, endsAt: row.endsAt }, now)) return false
    const targets = targetsById.get(row.id) ?? []
    return announcementMatchesUser(targets, { userId, accountTypeKey })
  })
}

export async function getAnnouncementGate(
  db: Db,
  userId: string,
  accountTypeKey: string,
): Promise<AnnouncementGateResult> {
  const pending = await listPendingAnnouncementsForUser(db, userId, accountTypeKey)
  const current = pending[0] ?? null
  return {
    locked: pending.length > 0,
    pendingCount: pending.length,
    currentId: current?.id ?? null,
  }
}

export async function getPendingAnnouncementViews(
  db: Db,
  userId: string,
  accountTypeKey: string,
): Promise<AnnouncementPublicView[]> {
  const pending = await listPendingAnnouncementsForUser(db, userId, accountTypeKey)
  return pending.map((row, index) => ({
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    bodyHtml: sanitizeAnnouncementHtml(row.bodyHtml),
    heroImageFileId: row.heroImageFileId,
    heroImageUrl: row.heroImageFileId ? `/api/files/${row.heroImageFileId}/preview` : null,
    ctaButtons: normalizeCtas(row.ctaButtons),
    index: index + 1,
    total: pending.length,
  }))
}

export async function acknowledgeAnnouncement(
  db: Db,
  announcementId: string,
  userId: string,
  accountTypeKey: string,
): Promise<AnnouncementGateResult> {
  const pending = await listPendingAnnouncementsForUser(db, userId, accountTypeKey)
  if (!pending.some(row => row.id === announcementId)) {
    throw new AnnouncementsServiceError('NOT_FOUND', 'Announcement is not pending for this user')
  }

  const [existingAck] = await db.select({ id: announcementAcknowledgements.id })
    .from(announcementAcknowledgements)
    .where(and(
      eq(announcementAcknowledgements.announcementId, announcementId),
      eq(announcementAcknowledgements.userId, userId),
    ))
    .limit(1)
  if (!existingAck) {
    await db.insert(announcementAcknowledgements).values({ announcementId, userId })
  }

  return getAnnouncementGate(db, userId, accountTypeKey)
}

function audienceSummary(targets: Array<typeof announcementTargets.$inferSelect>) {
  if (targets.some(t => t.targetType === 'all')) {
    return { mode: 'all' as const, accountTypeKeys: [] as string[], userIds: [] as string[] }
  }
  const accountTypeKeys = targets
    .filter(t => t.targetType === 'account_type' && t.accountTypeKey)
    .map(t => t.accountTypeKey!)
  if (accountTypeKeys.length) {
    return { mode: 'account_type' as const, accountTypeKeys, userIds: [] as string[] }
  }
  const userIds = targets
    .filter(t => t.targetType === 'user' && t.userId)
    .map(t => t.userId!)
  return { mode: 'user' as const, accountTypeKeys: [] as string[], userIds }
}

export async function listAnnouncementsAdmin(db: Db) {
  const rows = await db.select().from(announcements)
    .orderBy(desc(announcements.isActive), desc(announcements.priority), desc(announcements.updatedAt))

  const ids = rows.map(r => r.id)
  const targetsById = await loadTargetsForAnnouncements(db, ids)

  const ackCounts = ids.length
    ? await db.select({
      announcementId: announcementAcknowledgements.announcementId,
      count: sql<number>`count(*)::int`,
    })
      .from(announcementAcknowledgements)
      .where(inArray(announcementAcknowledgements.announcementId, ids))
      .groupBy(announcementAcknowledgements.announcementId)
    : []

  const ackMap = new Map(ackCounts.map(row => [row.announcementId, row.count]))

  return rows.map((row) => {
    const targets = targetsById.get(row.id) ?? []
    const audience = audienceSummary(targets)
    return {
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      isActive: row.isActive,
      priority: row.priority,
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      audienceMode: audience.mode,
      accountTypeKeys: audience.accountTypeKeys,
      userIds: audience.userIds,
      acknowledgementCount: ackMap.get(row.id) ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  })
}

export async function getAnnouncementAdmin(db: Db, id: string) {
  const [row] = await db.select().from(announcements).where(eq(announcements.id, id))
  if (!row) throw new AnnouncementsServiceError('NOT_FOUND', 'Announcement not found')

  const targets = await db.select().from(announcementTargets)
    .where(eq(announcementTargets.announcementId, id))
  const audience = audienceSummary(targets)

  let userLabels: Array<{ id: string, name: string, email: string }> = []
  if (audience.userIds.length) {
    userLabels = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
    }).from(users).where(inArray(users.id, audience.userIds))
  }

  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    bodyHtml: row.bodyHtml,
    heroImageFileId: row.heroImageFileId,
    heroImageUrl: row.heroImageFileId ? `/api/files/${row.heroImageFileId}/preview` : null,
    ctaButtons: normalizeCtas(row.ctaButtons),
    isActive: row.isActive,
    priority: row.priority,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    audienceMode: audience.mode,
    accountTypeKeys: audience.accountTypeKeys,
    userIds: audience.userIds,
    users: userLabels,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function createAnnouncement(
  db: Db,
  input: AnnouncementUpsertInput,
  actorId: string,
) {
  const startsAt = parseOptionalDate(input.startsAt ?? null)
  const endsAt = parseOptionalDate(input.endsAt ?? null)
  if (startsAt && endsAt && endsAt.getTime() < startsAt.getTime()) {
    throw new AnnouncementsServiceError('VALIDATION', 'End date must be after start date')
  }

  const [row] = await db.insert(announcements).values({
    title: input.title.trim(),
    subtitle: input.subtitle?.trim() || null,
    bodyHtml: sanitizeAnnouncementHtml(input.bodyHtml ?? ''),
    heroImageFileId: input.heroImageFileId ?? null,
    ctaButtons: normalizeCtas(input.ctaButtons),
    isActive: input.isActive ?? false,
    priority: input.priority ?? 0,
    startsAt,
    endsAt,
    createdBy: actorId,
  }).returning()

  if (!row) throw new AnnouncementsServiceError('CONFLICT', 'Could not create announcement')
  await replaceTargets(db, row.id, input.audience)
  return getAnnouncementAdmin(db, row.id)
}

export async function updateAnnouncement(
  db: Db,
  id: string,
  input: AnnouncementPatchInput,
) {
  const [existing] = await db.select().from(announcements).where(eq(announcements.id, id))
  if (!existing) throw new AnnouncementsServiceError('NOT_FOUND', 'Announcement not found')

  const startsAt = input.startsAt !== undefined
    ? parseOptionalDate(input.startsAt)
    : existing.startsAt
  const endsAt = input.endsAt !== undefined
    ? parseOptionalDate(input.endsAt)
    : existing.endsAt
  if (startsAt && endsAt && endsAt.getTime() < startsAt.getTime()) {
    throw new AnnouncementsServiceError('VALIDATION', 'End date must be after start date')
  }

  await db.update(announcements).set({
    title: input.title !== undefined ? input.title.trim() : existing.title,
    subtitle: input.subtitle !== undefined ? (input.subtitle?.trim() || null) : existing.subtitle,
    bodyHtml: input.bodyHtml !== undefined
      ? sanitizeAnnouncementHtml(input.bodyHtml)
      : existing.bodyHtml,
    heroImageFileId: input.heroImageFileId !== undefined
      ? input.heroImageFileId
      : existing.heroImageFileId,
    ctaButtons: input.ctaButtons !== undefined
      ? normalizeCtas(input.ctaButtons)
      : existing.ctaButtons,
    isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
    priority: input.priority !== undefined ? input.priority : existing.priority,
    startsAt,
    endsAt,
    updatedAt: new Date(),
  }).where(eq(announcements.id, id))

  if (input.audience) {
    await replaceTargets(db, id, input.audience)
  }

  return getAnnouncementAdmin(db, id)
}

export async function deleteAnnouncement(db: Db, id: string) {
  const [existing] = await db.select({ id: announcements.id }).from(announcements)
    .where(eq(announcements.id, id))
  if (!existing) throw new AnnouncementsServiceError('NOT_FOUND', 'Announcement not found')
  await db.delete(announcements).where(eq(announcements.id, id))
}

export async function listStaffAccountTypeOptions(db: Db) {
  const rows = await db.select({
    key: accountTypes.key,
    name: accountTypes.name,
  }).from(accountTypes)
    .where(sql`${accountTypes.key} <> 'customer'`)
    .orderBy(asc(accountTypes.name))
  return rows
}
