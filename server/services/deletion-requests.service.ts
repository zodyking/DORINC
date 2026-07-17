import { and, count, desc, eq, ilike, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Db } from '../db/client'
import { users } from '../db/schema/auth'
import {
  type DeletionEntityType,
  entityDeletionRequests,
} from '../db/schema/deletion-requests'
import { formatInvoiceNumber } from '../db/schema/invoices'
import { CustomersServiceError, getCustomer } from './customers.service'
import {
  hardDeleteCustomer,
  hardDeleteConversation,
  hardDeleteInvoice,
  hardDeleteServiceLog,
  hardDeleteVehicle,
} from './hard-delete.service'
import { getInvoice, InvoicesServiceError } from './invoices.service'
import {
  getServiceLog,
  ServiceLogsServiceError,
} from './service-logs.service'
import { getVehicle, VehiclesServiceError } from './vehicles.service'
import { getConversationDeletionLabel, MessagesServiceError } from './messages.service'
import { assertTeamConversationDeletable, TeamChatServiceError } from './team-chat.service'

export type DeletionRequestsServiceErrorCode
  = 'NOT_FOUND'
    | 'NOT_PENDING'
    | 'DUPLICATE_PENDING'
    | 'ALREADY_REMOVED'
    | 'INVALID_TRANSITION'
    | 'ENTITY_NOT_FOUND'

export class DeletionRequestsServiceError extends Error {
  constructor(public readonly code: DeletionRequestsServiceErrorCode) {
    super(code)
  }
}

export interface DeletionRequestRow {
  id: string
  entityType: DeletionEntityType
  entityId: string
  status: string
  reason: string
  entityLabel: string
  submittedBy: string
  submittedByName: string | null
  submittedByEmail: string | null
  reviewedBy: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  reviewReason: string | null
  createdAt: string
  entityHref: string
}

export interface ListDeletionRequestsFilter {
  entityType?: DeletionEntityType
  entityId?: string
  status?: 'pending' | 'approved' | 'rejected' | 'all'
  q?: string
  page?: number
  pageSize?: number
}

const reviewerUsers = alias(users, 'deletion_reviewer')

function vehicleLabel(busNumber: string | null, unitTag: string | null, make: string | null, model: string | null): string {
  const tag = busNumber || unitTag || 'Vehicle'
  const desc = [make, model].filter(Boolean).join(' ')
  return desc ? `${tag} — ${desc}` : tag
}

function entityHref(type: DeletionEntityType, id: string): string {
  switch (type) {
    case 'customer': return `/customers/${id}/edit`
    case 'vehicle': return `/vehicles/${id}/edit`
    case 'service_log': return `/service-logs/${id}`
    case 'invoice': return `/invoices/${id}/edit`
    case 'conversation': return `/messages?conversation=${id}`
  }
}

async function resolveEntityLabel(db: Db, entityType: DeletionEntityType, entityId: string): Promise<string> {
  switch (entityType) {
    case 'customer': {
      const row = await getCustomer(db, entityId)
      return row.displayName
    }
    case 'vehicle': {
      const row = await getVehicle(db, entityId)
      return vehicleLabel(row.busNumber, row.unitTag, row.make, row.model)
    }
    case 'service_log': {
      const row = await getServiceLog(db, entityId)
      return `SL-${String(row.logNumber).padStart(4, '0')}`
    }
    case 'invoice': {
      const row = await getInvoice(db, entityId)
      return formatInvoiceNumber(row.invoiceNumber)
    }
    case 'conversation':
      return getConversationDeletionLabel(db, entityId)
  }
}

async function assertEntityDeletable(db: Db, entityType: DeletionEntityType, entityId: string) {
  switch (entityType) {
    case 'customer': {
      await getCustomer(db, entityId)
      return
    }
    case 'vehicle': {
      await getVehicle(db, entityId)
      return
    }
    case 'service_log': {
      const row = await getServiceLog(db, entityId)
      if (row.invoiceId) throw new DeletionRequestsServiceError('INVALID_TRANSITION')
      return
    }
    case 'invoice': {
      const row = await getInvoice(db, entityId)
      if (row.status === 'paid') throw new DeletionRequestsServiceError('INVALID_TRANSITION')
      return
    }
    case 'conversation':
      try {
        await assertTeamConversationDeletable(db, entityId)
      }
      catch (err) {
        if (err instanceof TeamChatServiceError && err.code === 'FORBIDDEN') {
          throw new DeletionRequestsServiceError('INVALID_TRANSITION')
        }
        throw err
      }
      await getConversationDeletionLabel(db, entityId)
      return
  }
}

async function executeDeletion(db: Db, entityType: DeletionEntityType, entityId: string, actorId: string, _reason: string) {
  switch (entityType) {
    case 'customer':
      await hardDeleteCustomer(db, entityId)
      return
    case 'vehicle':
      await hardDeleteVehicle(db, entityId)
      return
    case 'service_log':
      await hardDeleteServiceLog(db, entityId)
      return
    case 'invoice':
      await hardDeleteInvoice(db, entityId)
      return
    case 'conversation':
      await hardDeleteConversation(db, entityId, actorId)
      return
  }
}

function mapRow(row: {
  request: typeof entityDeletionRequests.$inferSelect
  submitterName: string | null
  submitterEmail: string | null
  reviewerName: string | null
}): DeletionRequestRow {
  const r = row.request
  return {
    id: r.id,
    entityType: r.entityType,
    entityId: r.entityId,
    status: r.status,
    reason: r.reason,
    entityLabel: r.entityLabel,
    submittedBy: r.submittedBy,
    submittedByName: row.submitterName,
    submittedByEmail: row.submitterEmail,
    reviewedBy: r.reviewedBy,
    reviewedByName: row.reviewerName,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    reviewReason: r.reviewReason,
    createdAt: r.createdAt.toISOString(),
    entityHref: entityHref(r.entityType, r.entityId),
  }
}

function listSelect() {
  return {
    request: entityDeletionRequests,
    submitterName: users.name,
    submitterEmail: users.email,
    reviewerName: reviewerUsers.name,
  }
}

export async function countPendingDeletionRequests(db: Db): Promise<number> {
  try {
    const [row] = await db.select({ value: count() })
      .from(entityDeletionRequests)
      .where(eq(entityDeletionRequests.status, 'pending'))
    return Number(row?.value ?? 0)
  }
  catch {
    return 0
  }
}

export async function getPendingDeletionRequest(db: Db, entityType: DeletionEntityType, entityId: string) {
  const [row] = await db.select().from(entityDeletionRequests)
    .where(and(
      eq(entityDeletionRequests.entityType, entityType),
      eq(entityDeletionRequests.entityId, entityId),
      eq(entityDeletionRequests.status, 'pending'),
    ))
    .limit(1)
  return row ?? null
}

export async function createDeletionRequest(
  db: Db,
  entityType: DeletionEntityType,
  entityId: string,
  reason: string,
  submittedBy: string,
) {
  try {
    await assertEntityDeletable(db, entityType, entityId)
  }
  catch (err) {
    if (err instanceof CustomersServiceError && err.code === 'NOT_FOUND') {
      throw new DeletionRequestsServiceError('ENTITY_NOT_FOUND')
    }
    if (err instanceof VehiclesServiceError && err.code === 'NOT_FOUND') {
      throw new DeletionRequestsServiceError('ENTITY_NOT_FOUND')
    }
    if (err instanceof ServiceLogsServiceError && err.code === 'NOT_FOUND') {
      throw new DeletionRequestsServiceError('ENTITY_NOT_FOUND')
    }
    if (err instanceof InvoicesServiceError && err.code === 'NOT_FOUND') {
      throw new DeletionRequestsServiceError('ENTITY_NOT_FOUND')
    }
    if (err instanceof MessagesServiceError && err.code === 'NOT_FOUND') {
      throw new DeletionRequestsServiceError('ENTITY_NOT_FOUND')
    }
    throw err
  }

  const existing = await getPendingDeletionRequest(db, entityType, entityId)
  if (existing) throw new DeletionRequestsServiceError('DUPLICATE_PENDING')

  const entityLabel = await resolveEntityLabel(db, entityType, entityId)

  const [row] = await db.insert(entityDeletionRequests).values({
    entityType,
    entityId,
    reason: reason.trim(),
    entityLabel,
    submittedBy,
  }).returning()

  try {
    const submitter = await db.select({
      name: users.name,
    }).from(users).where(eq(users.id, submittedBy)).limit(1)
    const { notifyDeletionRequestSubmitted } = await import('./staff-notifications.service')
    await notifyDeletionRequestSubmitted(db, {
      submitterName: submitter[0]?.name || 'A staff member',
      submitterId: submittedBy,
      entityType,
      entityLabel,
      reason: reason.trim(),
      requestId: row!.id,
    })
  }
  catch (err) {
    console.warn('[mail] deletion request submitted notification failed:', (err as Error).message)
  }

  return row!
}

export async function listDeletionRequests(db: Db, filter: ListDeletionRequestsFilter) {
  const page = filter.page ?? 1
  const pageSize = filter.pageSize ?? 25
  const conditions = []

  if (filter.entityType) conditions.push(eq(entityDeletionRequests.entityType, filter.entityType))
  if (filter.entityId) conditions.push(eq(entityDeletionRequests.entityId, filter.entityId))
  if (filter.status && filter.status !== 'all') {
    conditions.push(eq(entityDeletionRequests.status, filter.status))
  }

  if (filter.q) {
    const term = `%${filter.q}%`
    conditions.push(or(
      ilike(entityDeletionRequests.entityLabel, term),
      ilike(entityDeletionRequests.reason, term),
      ilike(users.name, term),
      ilike(users.email, term),
    ))
  }

  const where = conditions.length ? and(...conditions) : undefined

  const [totalRow] = await db.select({ value: count() })
    .from(entityDeletionRequests)
    .innerJoin(users, eq(entityDeletionRequests.submittedBy, users.id))
    .where(where)

  const rows = await db.select(listSelect())
    .from(entityDeletionRequests)
    .innerJoin(users, eq(entityDeletionRequests.submittedBy, users.id))
    .leftJoin(reviewerUsers, eq(entityDeletionRequests.reviewedBy, reviewerUsers.id))
    .where(where)
    .orderBy(desc(entityDeletionRequests.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const pending = await countPendingDeletionRequests(db)

  return {
    items: rows.map(mapRow),
    total: Number(totalRow?.value ?? 0),
    pending,
    page,
    pageSize,
  }
}

async function getRequestById(db: Db, id: string) {
  const [row] = await db.select(listSelect())
    .from(entityDeletionRequests)
    .innerJoin(users, eq(entityDeletionRequests.submittedBy, users.id))
    .leftJoin(reviewerUsers, eq(entityDeletionRequests.reviewedBy, reviewerUsers.id))
    .where(eq(entityDeletionRequests.id, id))
    .limit(1)

  if (!row) throw new DeletionRequestsServiceError('NOT_FOUND')
  return row
}

export async function approveDeletionRequest(db: Db, id: string, actorId: string, reviewReason?: string | null) {
  const row = await getRequestById(db, id)
  if (row.request.status !== 'pending') throw new DeletionRequestsServiceError('NOT_PENDING')

  const [claimed] = await db.update(entityDeletionRequests)
    .set({
      status: 'approved',
      reviewedBy: actorId,
      reviewedAt: new Date(),
      reviewReason: reviewReason?.trim() || null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(entityDeletionRequests.id, id),
      eq(entityDeletionRequests.status, 'pending'),
    ))
    .returning()

  if (!claimed) throw new DeletionRequestsServiceError('NOT_PENDING')

  try {
    await executeDeletion(db, claimed.entityType, claimed.entityId, actorId, claimed.reason)
  }
  catch (err) {
    await db.update(entityDeletionRequests)
      .set({
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null,
        updatedAt: new Date(),
      })
      .where(eq(entityDeletionRequests.id, id))

    if (err instanceof InvoicesServiceError && err.code === 'INVALID_TRANSITION') {
      throw new DeletionRequestsServiceError('INVALID_TRANSITION')
    }
    throw err
  }

  const mapped = mapRow(await getRequestById(db, id))
  try {
    const { notifyDeletionRequestResult } = await import('./staff-notifications.service')
    await notifyDeletionRequestResult(db, {
      requestorEmail: mapped.submittedByEmail,
      requestorName: mapped.submittedByName,
      requestorId: mapped.submittedBy,
      status: 'approved',
      entityType: mapped.entityType,
      entityLabel: mapped.entityLabel,
      reviewReason: mapped.reviewReason,
      reviewedByName: mapped.reviewedByName,
      requestId: mapped.id,
    })
  }
  catch (err) {
    console.warn('[mail] deletion request approved notification failed:', (err as Error).message)
  }

  return { request: mapped }
}

export async function directDeleteEntity(
  db: Db,
  entityType: DeletionEntityType,
  entityId: string,
  _actorId: string,
  _reason?: string | null,
) {
  await assertEntityDeletable(db, entityType, entityId)
  await executeDeletion(db, entityType, entityId, _actorId, _reason ?? '')
  return { entityType, entityId }
}

export async function rejectDeletionRequest(db: Db, id: string, actorId: string, reviewReason: string) {
  const row = await getRequestById(db, id)
  if (row.request.status !== 'pending') throw new DeletionRequestsServiceError('NOT_PENDING')

  const [updated] = await db.update(entityDeletionRequests)
    .set({
      status: 'rejected',
      reviewedBy: actorId,
      reviewedAt: new Date(),
      reviewReason: reviewReason.trim(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(entityDeletionRequests.id, id),
      eq(entityDeletionRequests.status, 'pending'),
    ))
    .returning()

  if (!updated) throw new DeletionRequestsServiceError('NOT_PENDING')

  const mapped = mapRow(await getRequestById(db, id))
  try {
    const { notifyDeletionRequestResult } = await import('./staff-notifications.service')
    await notifyDeletionRequestResult(db, {
      requestorEmail: mapped.submittedByEmail,
      requestorName: mapped.submittedByName,
      requestorId: mapped.submittedBy,
      status: 'rejected',
      entityType: mapped.entityType,
      entityLabel: mapped.entityLabel,
      reviewReason: mapped.reviewReason,
      reviewedByName: mapped.reviewedByName,
      requestId: mapped.id,
    })
  }
  catch (err) {
    console.warn('[mail] deletion request rejected notification failed:', (err as Error).message)
  }

  return { request: mapped }
}
