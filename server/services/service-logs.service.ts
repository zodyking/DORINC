import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { ServiceLogStatus, ServiceLogWorkType } from '../db/schema/service-logs'
import { serviceLogs } from '../db/schema/service-logs'
import { customers } from '../db/schema/customers'
import { vehicles } from '../db/schema/vehicles'
import { users } from '../db/schema/auth'
import { appFiles } from '../db/schema/files'

export type ServiceLogsServiceErrorCode
  = 'NOT_FOUND' | 'CUSTOMER_NOT_FOUND' | 'VEHICLE_NOT_FOUND' | 'VEHICLE_CUSTOMER_MISMATCH'
    | 'INVALID_TRANSITION' | 'NOT_EDITABLE'

export class ServiceLogsServiceError extends Error {
  constructor(public readonly code: ServiceLogsServiceErrorCode) {
    super(code)
  }
}

/**
 * Allowed status transitions (SPEC §6.4). OCR/AI states are wired for the
 * Phase 2 workers; review-side moves are gated by permissions at the route.
 */
export const SERVICE_LOG_TRANSITIONS: Record<ServiceLogStatus, ServiceLogStatus[]> = {
  uploaded: ['ocr_processing', 'ai_processing', 'ready_for_review', 'archived'],
  ocr_processing: ['ai_processing', 'ready_for_review'],
  ai_processing: ['ready_for_review'],
  ready_for_review: ['in_review', 'archived'],
  in_review: ['needs_info', 'approved_for_invoice', 'rejected', 'ready_for_review'],
  needs_info: ['ready_for_review', 'in_review', 'archived'],
  approved_for_invoice: ['converted_to_invoice', 'in_review'],
  rejected: ['ready_for_review', 'archived'],
  converted_to_invoice: [],
  archived: ['ready_for_review'],
}

/** Transitions a mechanic may perform on their own log (submit / resubmit). */
export const MECHANIC_TRANSITIONS: Array<{ from: ServiceLogStatus, to: ServiceLogStatus }> = [
  { from: 'uploaded', to: 'ready_for_review' },
  { from: 'needs_info', to: 'ready_for_review' },
]

/** Statuses in which the submitting mechanic may still edit their own log. */
export const MECHANIC_EDITABLE_STATUSES: ServiceLogStatus[] = ['uploaded', 'needs_info']

/** Logs awaiting accountant review (SPEC §6.4 review queue). */
export const SERVICE_LOG_REVIEW_QUEUE_STATUSES: ServiceLogStatus[] = [
  'uploaded',
  'ocr_processing',
  'ai_processing',
  'ready_for_review',
  'in_review',
  'needs_info',
]

export interface ServiceLogInput {
  customerId: string
  vehicleId: string
  serviceDate: string
  odometerReading?: string | null
  location?: string | null
  workType?: ServiceLogWorkType
  complaint?: string | null
  internalNotes?: string | null
}

export async function createServiceLog(db: Db, input: ServiceLogInput, submittedBy: string) {
  const [customer] = await db.select({ id: customers.id })
    .from(customers).where(and(eq(customers.id, input.customerId), isNull(customers.archivedAt)))
  if (!customer) throw new ServiceLogsServiceError('CUSTOMER_NOT_FOUND')

  const [vehicle] = await db.select({ id: vehicles.id, customerId: vehicles.customerId })
    .from(vehicles).where(and(eq(vehicles.id, input.vehicleId), isNull(vehicles.archivedAt)))
  if (!vehicle) throw new ServiceLogsServiceError('VEHICLE_NOT_FOUND')
  if (vehicle.customerId !== input.customerId) throw new ServiceLogsServiceError('VEHICLE_CUSTOMER_MISMATCH')

  const [row] = await db.insert(serviceLogs).values({
    customerId: input.customerId,
    vehicleId: input.vehicleId,
    submittedBy,
    serviceDate: input.serviceDate,
    odometerReading: input.odometerReading ?? null,
    location: input.location ?? null,
    workType: input.workType ?? 'repair',
    complaint: input.complaint ?? null,
    internalNotes: input.internalNotes ?? null,
  }).returning()
  return row!
}

export async function getServiceLog(db: Db, id: string) {
  const [row] = await db
    .select({
      log: serviceLogs,
      customerName: customers.displayName,
      submitterName: users.name,
      vehicle: {
        id: vehicles.id,
        unitType: vehicles.unitType,
        busNumber: vehicles.busNumber,
        unitTag: vehicles.unitTag,
        year: vehicles.year,
        make: vehicles.make,
        model: vehicles.model,
        trim: vehicles.trim,
        vin: vehicles.vin,
      },
    })
    .from(serviceLogs)
    .innerJoin(customers, eq(serviceLogs.customerId, customers.id))
    .innerJoin(vehicles, eq(serviceLogs.vehicleId, vehicles.id))
    .innerJoin(users, eq(serviceLogs.submittedBy, users.id))
    .where(eq(serviceLogs.id, id))
  if (!row) throw new ServiceLogsServiceError('NOT_FOUND')
  return {
    ...row.log,
    customerName: row.customerName,
    submitterName: row.submitterName,
    vehicle: row.vehicle,
  }
}

export type ServiceLogPatch = Partial<Omit<ServiceLogInput, 'customerId' | 'vehicleId'>> & {
  draftLineItems?: unknown
}

export async function updateServiceLog(db: Db, id: string, patch: ServiceLogPatch) {
  const before = await getServiceLog(db, id)

  const changes: Record<string, unknown> = { updatedAt: new Date() }
  const changedFields: string[] = []
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && JSON.stringify(value) !== JSON.stringify(before[key as keyof typeof before])) {
      changes[key] = value
      changedFields.push(key)
    }
  }

  if (!changedFields.length) return { log: before, before, changedFields }

  const [updated] = await db.update(serviceLogs)
    .set(changes)
    .where(eq(serviceLogs.id, id))
    .returning()

  return { log: updated!, before, changedFields }
}

export async function transitionServiceLog(
  db: Db,
  id: string,
  to: ServiceLogStatus,
  opts: { reason?: string | null, invoiceId?: string | null } = {},
) {
  const before = await getServiceLog(db, id)

  if (!SERVICE_LOG_TRANSITIONS[before.status].includes(to)) {
    throw new ServiceLogsServiceError('INVALID_TRANSITION')
  }

  const changes: Record<string, unknown> = {
    status: to,
    statusReason: opts.reason ?? null,
    updatedAt: new Date(),
  }
  if (to === 'archived') changes.archivedAt = new Date()
  if (before.status === 'archived' && to !== 'archived') changes.archivedAt = null
  if (to === 'converted_to_invoice' && opts.invoiceId) changes.invoiceId = opts.invoiceId

  const [updated] = await db.update(serviceLogs)
    .set(changes)
    .where(eq(serviceLogs.id, id))
    .returning()

  return { log: updated!, before }
}

export interface ListServiceLogsFilter {
  q?: string
  status?: ServiceLogStatus
  /** When true, only logs in the review queue (pending accountant action). */
  queue?: 'review'
  customerId?: string
  vehicleId?: string
  /** Restrict to logs submitted by this user (mechanic `.own` scope). */
  submittedBy?: string
  includeArchived?: boolean
  sort?: 'newest' | 'oldest' | 'status'
  page: number
  pageSize: number
}

export async function listServiceLogs(db: Db, filter: ListServiceLogsFilter) {
  const conditions = []

  if (!filter.includeArchived && !filter.status && !filter.queue) conditions.push(isNull(serviceLogs.archivedAt))
  if (filter.status) conditions.push(eq(serviceLogs.status, filter.status))
  else if (filter.queue === 'review') conditions.push(inArray(serviceLogs.status, SERVICE_LOG_REVIEW_QUEUE_STATUSES))
  if (filter.customerId) conditions.push(eq(serviceLogs.customerId, filter.customerId))
  if (filter.vehicleId) conditions.push(eq(serviceLogs.vehicleId, filter.vehicleId))
  if (filter.submittedBy) conditions.push(eq(serviceLogs.submittedBy, filter.submittedBy))

  if (filter.q) {
    const term = `%${filter.q}%`
    conditions.push(or(
      ilike(customers.displayName, term),
      ilike(vehicles.busNumber, term),
      ilike(vehicles.make, term),
      ilike(vehicles.model, term),
      ilike(serviceLogs.complaint, term),
      ilike(serviceLogs.internalNotes, term),
    ))
  }

  const where = conditions.length ? and(...conditions) : undefined
  const orderBy = filter.sort === 'oldest'
    ? asc(serviceLogs.createdAt)
    : filter.sort === 'status'
      ? asc(serviceLogs.status)
      : desc(serviceLogs.createdAt)

  const rows = await db.select({
    log: serviceLogs,
    customerName: customers.displayName,
    submitterName: users.name,
    vehicle: {
      unitType: vehicles.unitType,
      busNumber: vehicles.busNumber,
      unitTag: vehicles.unitTag,
      year: vehicles.year,
      make: vehicles.make,
      model: vehicles.model,
    },
  })
    .from(serviceLogs)
    .innerJoin(customers, eq(serviceLogs.customerId, customers.id))
    .innerJoin(vehicles, eq(serviceLogs.vehicleId, vehicles.id))
    .innerJoin(users, eq(serviceLogs.submittedBy, users.id))
    .where(where)
    .orderBy(orderBy)
    .limit(filter.pageSize)
    .offset((filter.page - 1) * filter.pageSize)

  const [total] = await db.select({ value: count() })
    .from(serviceLogs)
    .innerJoin(customers, eq(serviceLogs.customerId, customers.id))
    .innerJoin(vehicles, eq(serviceLogs.vehicleId, vehicles.id))
    .innerJoin(users, eq(serviceLogs.submittedBy, users.id))
    .where(where)

  // File counts per log — metadata only, no blobs (SPEC §8)
  const logIds = rows.map(r => r.log.id)
  const fileCounts = new Map<string, number>()
  if (logIds.length) {
    const counts = await db.select({
      ownerId: appFiles.ownerEntityId,
      value: count(),
    })
      .from(appFiles)
      .where(and(
        eq(appFiles.ownerEntityType, 'service_log'),
        isNull(appFiles.archivedAt),
        or(...logIds.map((lid: string) => eq(appFiles.ownerEntityId, lid))),
      ))
      .groupBy(appFiles.ownerEntityId)
    for (const c of counts) fileCounts.set(c.ownerId, Number(c.value))
  }

  return {
    items: rows.map(r => ({
      ...r.log,
      customerName: r.customerName,
      submitterName: r.submitterName,
      vehicle: r.vehicle,
      fileCount: fileCounts.get(r.log.id) ?? 0,
    })),
    total: Number(total!.value),
    page: filter.page,
    pageSize: filter.pageSize,
  }
}
