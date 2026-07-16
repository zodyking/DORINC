import { and, count, desc, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { users } from '../db/schema/auth'
import { customers } from '../db/schema/customers'
import { formatInvoiceNumber, invoices } from '../db/schema/invoices'
import {
  invoiceChangeRequests,
  newVehicleRequests,
  portalGeneralRequests,
  serviceRequests,
  vehicleChangeRequests,
} from '../db/schema/portal-requests'
import { vehicles } from '../db/schema/vehicles'
import {
  createInvoice,
  createInvoiceRevision,
  getInvoice,
  listInvoiceLineItems,
  REVISION_SOURCE_STATUSES,
  updateInvoiceDraft,
  updateInvoiceLineItem,
} from './invoices.service'
import { createVehicle, getVehicle, updateVehicle } from './vehicles.service'
import { notifyPortalRequestStatus } from './customer-notifications.service'
import type { PortalRequestReviewKind } from '../../shared/validators/portal-request-review'

export type PortalRequestReviewErrorCode
  = 'NOT_FOUND' | 'NOT_PENDING' | 'INVALID_INVOICE' | 'DUPLICATE_BUS_NUMBER' | 'VEHICLE_NOT_FOUND'

export class PortalRequestReviewError extends Error {
  constructor(public readonly code: PortalRequestReviewErrorCode) {
    super(code)
  }
}

export interface StaffPortalRequestRow {
  id: string
  kind: PortalRequestReviewKind
  status: string
  customerId: string
  customerName: string
  submittedByName: string | null
  submittedByEmail: string | null
  createdAt: string
  title: string
  summary: string
  detail: string | null
  urgency: string | null
  invoiceId: string | null
  invoiceNumberFormatted: string | null
  vehicleId: string | null
  vehicleLabel: string | null
  resultInvoiceId: string | null
  resultVehicleId: string | null
  reviewedAt: string | null
  reviewReason: string | null
}

export interface ListStaffPortalRequestsFilter {
  kind?: PortalRequestReviewKind
  status?: 'pending' | 'approved' | 'rejected' | 'all'
  q?: string
  page?: number
  pageSize?: number
}

function vehicleLabel(busNumber: string | null, unitTag: string | null, make: string | null, model: string | null): string {
  const tag = busNumber || unitTag || 'Vehicle'
  const desc = [make, model].filter(Boolean).join(' ')
  return desc ? `${tag} — ${desc}` : tag
}

function reviewPatch(actorId: string, reason?: string | null) {
  return {
    reviewedBy: actorId,
    reviewedAt: new Date(),
    reviewReason: reason?.trim() || null,
    updatedAt: new Date(),
  }
}

async function assertPending<T extends { status: string }>(row: T | undefined): Promise<T> {
  if (!row) throw new PortalRequestReviewError('NOT_FOUND')
  if (row.status !== 'pending') throw new PortalRequestReviewError('NOT_PENDING')
  return row
}

export async function countPendingPortalRequests(db: Db): Promise<number> {
  const tables = [
    serviceRequests,
    invoiceChangeRequests,
    vehicleChangeRequests,
    portalGeneralRequests,
    newVehicleRequests,
  ] as const

  let total = 0
  for (const table of tables) {
    const [row] = await db.select({ value: count() }).from(table).where(eq(table.status, 'pending'))
    total += Number(row?.value ?? 0)
  }
  return total
}

async function mapServiceRows(db: Db, statusFilter?: string): Promise<StaffPortalRequestRow[]> {
  const conditions = statusFilter && statusFilter !== 'all' ? [eq(serviceRequests.status, statusFilter)] : []
  const rows = await db.select({
    request: serviceRequests,
    customerName: customers.displayName,
    submitterName: users.name,
    submitterEmail: users.email,
    busNumber: vehicles.busNumber,
    unitTag: vehicles.unitTag,
    make: vehicles.make,
    model: vehicles.model,
  })
    .from(serviceRequests)
    .innerJoin(customers, eq(serviceRequests.customerId, customers.id))
    .innerJoin(users, eq(serviceRequests.submittedBy, users.id))
    .innerJoin(vehicles, eq(serviceRequests.vehicleId, vehicles.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(serviceRequests.createdAt))

  return rows.map(r => ({
    id: r.request.id,
    kind: 'service' as const,
    status: r.request.status,
    customerId: r.request.customerId,
    customerName: r.customerName,
    submittedByName: r.submitterName,
    submittedByEmail: r.submitterEmail,
    createdAt: r.request.createdAt.toISOString(),
    title: r.request.serviceCategory,
    summary: r.request.description,
    detail: [r.request.urgency !== 'normal' ? `Urgency: ${r.request.urgency}` : null, r.request.preferredDate ? `Preferred: ${r.request.preferredDate}` : null, r.request.location].filter(Boolean).join(' · ') || null,
    urgency: r.request.urgency,
    invoiceId: null,
    invoiceNumberFormatted: null,
    vehicleId: r.request.vehicleId,
    vehicleLabel: vehicleLabel(r.busNumber, r.unitTag, r.make, r.model),
    resultInvoiceId: r.request.resultInvoiceId,
    resultVehicleId: null,
    reviewedAt: r.request.reviewedAt?.toISOString() ?? null,
    reviewReason: r.request.reviewReason,
  }))
}

async function mapInvoiceChangeRows(db: Db, statusFilter?: string): Promise<StaffPortalRequestRow[]> {
  const conditions = statusFilter && statusFilter !== 'all' ? [eq(invoiceChangeRequests.status, statusFilter)] : []
  const rows = await db.select({
    request: invoiceChangeRequests,
    customerName: customers.displayName,
    submitterName: users.name,
    submitterEmail: users.email,
    invoiceNumber: invoices.invoiceNumber,
  })
    .from(invoiceChangeRequests)
    .innerJoin(customers, eq(invoiceChangeRequests.customerId, customers.id))
    .innerJoin(users, eq(invoiceChangeRequests.submittedBy, users.id))
    .leftJoin(invoices, eq(invoiceChangeRequests.invoiceId, invoices.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(invoiceChangeRequests.createdAt))

  return rows.map(r => ({
    id: r.request.id,
    kind: 'invoice_change' as const,
    status: r.request.status,
    customerId: r.request.customerId,
    customerName: r.customerName,
    submittedByName: r.submitterName,
    submittedByEmail: r.submitterEmail,
    createdAt: r.request.createdAt.toISOString(),
    title: r.request.topic,
    summary: r.request.description,
    detail: null,
    urgency: null,
    invoiceId: r.request.invoiceId,
    invoiceNumberFormatted: r.invoiceNumber != null ? formatInvoiceNumber(r.invoiceNumber) : null,
    vehicleId: null,
    vehicleLabel: null,
    resultInvoiceId: r.request.resultInvoiceId,
    resultVehicleId: null,
    reviewedAt: r.request.reviewedAt?.toISOString() ?? null,
    reviewReason: r.request.reviewReason,
  }))
}

async function mapVehicleChangeRows(db: Db, statusFilter?: string): Promise<StaffPortalRequestRow[]> {
  const conditions = statusFilter && statusFilter !== 'all' ? [eq(vehicleChangeRequests.status, statusFilter)] : []
  const rows = await db.select({
    request: vehicleChangeRequests,
    customerName: customers.displayName,
    submitterName: users.name,
    submitterEmail: users.email,
    busNumber: vehicles.busNumber,
    unitTag: vehicles.unitTag,
    make: vehicles.make,
    model: vehicles.model,
  })
    .from(vehicleChangeRequests)
    .innerJoin(customers, eq(vehicleChangeRequests.customerId, customers.id))
    .innerJoin(users, eq(vehicleChangeRequests.submittedBy, users.id))
    .innerJoin(vehicles, eq(vehicleChangeRequests.vehicleId, vehicles.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(vehicleChangeRequests.createdAt))

  return rows.map(r => ({
    id: r.request.id,
    kind: 'vehicle_change' as const,
    status: r.request.status,
    customerId: r.request.customerId,
    customerName: r.customerName,
    submittedByName: r.submitterName,
    submittedByEmail: r.submitterEmail,
    createdAt: r.request.createdAt.toISOString(),
    title: r.request.subject,
    summary: r.request.description,
    detail: null,
    urgency: null,
    invoiceId: null,
    invoiceNumberFormatted: null,
    vehicleId: r.request.vehicleId,
    vehicleLabel: vehicleLabel(r.busNumber, r.unitTag, r.make, r.model),
    resultInvoiceId: null,
    resultVehicleId: null,
    reviewedAt: r.request.reviewedAt?.toISOString() ?? null,
    reviewReason: r.request.reviewReason,
  }))
}

async function mapGeneralRows(db: Db, statusFilter?: string): Promise<StaffPortalRequestRow[]> {
  const conditions = statusFilter && statusFilter !== 'all' ? [eq(portalGeneralRequests.status, statusFilter)] : []
  const rows = await db.select({
    request: portalGeneralRequests,
    customerName: customers.displayName,
    submitterName: users.name,
    submitterEmail: users.email,
  })
    .from(portalGeneralRequests)
    .innerJoin(customers, eq(portalGeneralRequests.customerId, customers.id))
    .innerJoin(users, eq(portalGeneralRequests.submittedBy, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(portalGeneralRequests.createdAt))

  return rows.map(r => ({
    id: r.request.id,
    kind: 'general' as const,
    status: r.request.status,
    customerId: r.request.customerId,
    customerName: r.customerName,
    submittedByName: r.submitterName,
    submittedByEmail: r.submitterEmail,
    createdAt: r.request.createdAt.toISOString(),
    title: r.request.subject,
    summary: r.request.message,
    detail: null,
    urgency: null,
    invoiceId: null,
    invoiceNumberFormatted: null,
    vehicleId: null,
    vehicleLabel: null,
    resultInvoiceId: null,
    resultVehicleId: null,
    reviewedAt: r.request.reviewedAt?.toISOString() ?? null,
    reviewReason: r.request.reviewReason,
  }))
}

async function mapNewVehicleRows(db: Db, statusFilter?: string): Promise<StaffPortalRequestRow[]> {
  const conditions = statusFilter && statusFilter !== 'all' ? [eq(newVehicleRequests.status, statusFilter)] : []
  const rows = await db.select({
    request: newVehicleRequests,
    customerName: customers.displayName,
    submitterName: users.name,
    submitterEmail: users.email,
  })
    .from(newVehicleRequests)
    .innerJoin(customers, eq(newVehicleRequests.customerId, customers.id))
    .innerJoin(users, eq(newVehicleRequests.submittedBy, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(newVehicleRequests.createdAt))

  return rows.map(r => ({
    id: r.request.id,
    kind: 'new_vehicle' as const,
    status: r.request.status,
    customerId: r.request.customerId,
    customerName: r.customerName,
    submittedByName: r.submitterName,
    submittedByEmail: r.submitterEmail,
    createdAt: r.request.createdAt.toISOString(),
    title: `Add ${r.request.fleetTag}`,
    summary: [r.request.year, r.request.make, r.request.model].filter(Boolean).join(' ') || r.request.unitType,
    detail: r.request.notes,
    urgency: null,
    invoiceId: null,
    invoiceNumberFormatted: null,
    vehicleId: null,
    vehicleLabel: r.request.fleetTag,
    resultInvoiceId: null,
    resultVehicleId: r.request.resultVehicleId,
    reviewedAt: r.request.reviewedAt?.toISOString() ?? null,
    reviewReason: r.request.reviewReason,
  }))
}

function matchesSearch(row: StaffPortalRequestRow, q: string): boolean {
  const hay = [
    row.customerName,
    row.title,
    row.summary,
    row.detail,
    row.submittedByName,
    row.submittedByEmail,
    row.vehicleLabel,
    row.invoiceNumberFormatted,
  ].filter(Boolean).join(' ').toLowerCase()
  return hay.includes(q.toLowerCase())
}

export async function listStaffPortalRequests(db: Db, filter: ListStaffPortalRequestsFilter = {}) {
  const status = filter.status ?? 'pending'
  const page = filter.page ?? 1
  const pageSize = filter.pageSize ?? 25

  const kinds: PortalRequestReviewKind[] = filter.kind
    ? [filter.kind]
    : ['service', 'invoice_change', 'vehicle_change', 'general', 'new_vehicle']

  let items: StaffPortalRequestRow[] = []
  for (const kind of kinds) {
    if (kind === 'service') items.push(...await mapServiceRows(db, status))
    else if (kind === 'invoice_change') items.push(...await mapInvoiceChangeRows(db, status))
    else if (kind === 'vehicle_change') items.push(...await mapVehicleChangeRows(db, status))
    else if (kind === 'general') items.push(...await mapGeneralRows(db, status))
    else if (kind === 'new_vehicle') items.push(...await mapNewVehicleRows(db, status))
  }

  if (filter.q) items = items.filter(row => matchesSearch(row, filter.q!))

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const total = items.length
  const offset = (page - 1) * pageSize
  const paged = items.slice(offset, offset + pageSize)

  const pending = await countPendingPortalRequests(db)

  return { items: paged, total, pending, page, pageSize }
}

export async function rejectPortalRequest(
  db: Db,
  kind: PortalRequestReviewKind,
  id: string,
  actorId: string,
  reason: string,
) {
  const patch = { status: 'rejected' as const, ...reviewPatch(actorId, reason) }

  if (kind === 'service') {
    const [row] = await db.update(serviceRequests).set(patch).where(and(eq(serviceRequests.id, id), eq(serviceRequests.status, 'pending'))).returning()
    if (!row) throw new PortalRequestReviewError('NOT_FOUND')
    await notifyPortalRequestStatus(db, kind, row, 'rejected').catch(() => {})
    return row
  }
  if (kind === 'invoice_change') {
    const [row] = await db.update(invoiceChangeRequests).set(patch).where(and(eq(invoiceChangeRequests.id, id), eq(invoiceChangeRequests.status, 'pending'))).returning()
    if (!row) throw new PortalRequestReviewError('NOT_FOUND')
    await notifyPortalRequestStatus(db, kind, row, 'rejected').catch(() => {})
    return row
  }
  if (kind === 'vehicle_change') {
    const [row] = await db.update(vehicleChangeRequests).set(patch).where(and(eq(vehicleChangeRequests.id, id), eq(vehicleChangeRequests.status, 'pending'))).returning()
    if (!row) throw new PortalRequestReviewError('NOT_FOUND')
    await notifyPortalRequestStatus(db, kind, row, 'rejected').catch(() => {})
    return row
  }
  if (kind === 'general') {
    const [row] = await db.update(portalGeneralRequests).set(patch).where(and(eq(portalGeneralRequests.id, id), eq(portalGeneralRequests.status, 'pending'))).returning()
    if (!row) throw new PortalRequestReviewError('NOT_FOUND')
    await notifyPortalRequestStatus(db, kind, row, 'rejected').catch(() => {})
    return row
  }
  if (kind === 'new_vehicle') {
    const [row] = await db.update(newVehicleRequests).set(patch).where(and(eq(newVehicleRequests.id, id), eq(newVehicleRequests.status, 'pending'))).returning()
    if (!row) throw new PortalRequestReviewError('NOT_FOUND')
    await notifyPortalRequestStatus(db, kind, row, 'rejected').catch(() => {})
    return row
  }

  throw new PortalRequestReviewError('NOT_FOUND')
}

export async function approveServiceRequest(
  db: Db,
  id: string,
  actorId: string,
  reason?: string | null,
) {
  // Claim pending status before side effects — prevents duplicate invoices on double-approve.
  const [claimed] = await db.update(serviceRequests).set({
    status: 'approved',
    ...reviewPatch(actorId, reason),
  }).where(and(eq(serviceRequests.id, id), eq(serviceRequests.status, 'pending'))).returning()
  if (!claimed) throw new PortalRequestReviewError('NOT_PENDING')

  const internalNotes = [
    `Portal service request (${claimed.serviceCategory}, ${claimed.urgency})`,
    claimed.preferredDate ? `Preferred date: ${claimed.preferredDate}` : null,
    reason?.trim() ? `Staff note: ${reason.trim()}` : null,
  ].filter(Boolean).join('\n')

  const invoice = await createInvoice(db, {
    creationSource: 'service_request',
    customerId: claimed.customerId,
    vehicleId: claimed.vehicleId,
    serviceRequestId: claimed.id,
    invoiceDate: new Date().toISOString().slice(0, 10),
    complaint: claimed.description,
    serviceLocation: claimed.location ?? null,
    internalNotes,
  }, actorId)

  const [row] = await db.update(serviceRequests).set({
    resultInvoiceId: invoice.id,
  }).where(eq(serviceRequests.id, id)).returning()

  await notifyPortalRequestStatus(db, 'service', row!, 'approved').catch(() => {})
  return { request: row!, invoice }
}

export async function approveInvoiceChangeRequest(
  db: Db,
  id: string,
  actorId: string,
  reason?: string | null,
) {
  const [pending] = await db.select().from(invoiceChangeRequests).where(eq(invoiceChangeRequests.id, id))
  await assertPending(pending)

  if (pending!.invoiceId) {
    const source = await getInvoice(db, pending!.invoiceId)
    if (!REVISION_SOURCE_STATUSES.includes(source.status)) {
      throw new PortalRequestReviewError('INVALID_INVOICE')
    }
  }

  // Claim pending status before side effects — prevents duplicate revisions on double-approve.
  const [claimed] = await db.update(invoiceChangeRequests).set({
    status: 'approved',
    ...reviewPatch(actorId, reason),
  }).where(and(eq(invoiceChangeRequests.id, id), eq(invoiceChangeRequests.status, 'pending'))).returning()
  if (!claimed) throw new PortalRequestReviewError('NOT_PENDING')

  let revision = null
  if (claimed.invoiceId) {
    const source = await getInvoice(db, claimed.invoiceId)
    revision = await createInvoiceRevision(db, claimed.invoiceId, actorId)
    const noteBlock = [
      `Portal correction: ${claimed.topic}`,
      claimed.description,
      reason?.trim() ? `Staff note: ${reason.trim()}` : null,
    ].filter(Boolean).join('\n\n')

    await updateInvoiceDraft(db, revision.id, {
      internalNotes: [source.internalNotes, noteBlock].filter(Boolean).join('\n\n'),
      customerNotes: [source.customerNotes, `Customer correction request: ${claimed.topic}`].filter(Boolean).join('\n\n'),
    }, actorId)

    if (claimed.correctionPayload) {
      const payload = claimed.correctionPayload
      const sourceLines = await listInvoiceLineItems(db, claimed.invoiceId!)
      const sourceLine = sourceLines.find(line => line.id === payload.lineItemId)
      if (!sourceLine) throw new PortalRequestReviewError('INVALID_INVOICE')

      const revisionLines = await listInvoiceLineItems(db, revision.id)
      const revisionLine = revisionLines.find(line => line.sortOrder === sourceLine.sortOrder)
      if (!revisionLine) throw new PortalRequestReviewError('INVALID_INVOICE')

      await updateInvoiceLineItem(db, revision.id, revisionLine.id, {
        description: payload.proposed.description,
        quantity: payload.proposed.quantity,
        unitPrice: payload.proposed.unitPrice,
      }, actorId)
    }

    revision = await getInvoice(db, revision.id)
  }

  const [row] = await db.update(invoiceChangeRequests).set({
    resultInvoiceId: revision?.id ?? null,
  }).where(eq(invoiceChangeRequests.id, id)).returning()

  await notifyPortalRequestStatus(db, 'invoice_change', row!, 'approved').catch(() => {})
  return { request: row!, revision, sourceInvoiceId: claimed.invoiceId }
}

export async function approveVehicleChangeRequest(
  db: Db,
  id: string,
  actorId: string,
  reason?: string | null,
) {
  const [pending] = await db.select().from(vehicleChangeRequests).where(eq(vehicleChangeRequests.id, id))
  await assertPending(pending)

  try {
    const vehicle = await getVehicle(db, pending!.vehicleId)
    const stamp = new Date().toISOString().slice(0, 10)
    const note = [
      vehicle.notes,
      `[Portal correction approved ${stamp}] ${pending!.subject}: ${pending!.description}`,
      reason?.trim() ? `Staff note: ${reason.trim()}` : null,
    ].filter(Boolean).join('\n')

    await updateVehicle(db, pending!.vehicleId, { notes: note })
  }
  catch {
    throw new PortalRequestReviewError('VEHICLE_NOT_FOUND')
  }

  const [row] = await db.update(vehicleChangeRequests).set({
    status: 'approved',
    ...reviewPatch(actorId, reason),
  }).where(eq(vehicleChangeRequests.id, id)).returning()

  await notifyPortalRequestStatus(db, 'vehicle_change', row!, 'approved').catch(() => {})
  return { request: row! }
}

export async function approveGeneralRequest(
  db: Db,
  id: string,
  actorId: string,
  reason?: string | null,
) {
  const [row] = await db.update(portalGeneralRequests).set({
    status: 'approved',
    ...reviewPatch(actorId, reason),
  }).where(and(eq(portalGeneralRequests.id, id), eq(portalGeneralRequests.status, 'pending'))).returning()

  const request = await assertPending(row)
  await notifyPortalRequestStatus(db, 'general', request, 'approved').catch(() => {})
  return { request }
}

export async function approveNewVehicleRequest(
  db: Db,
  id: string,
  actorId: string,
  reason?: string | null,
) {
  // Claim pending status before side effects — prevents duplicate vehicles on double-approve.
  const [claimed] = await db.update(newVehicleRequests).set({
    status: 'approved',
    ...reviewPatch(actorId, reason),
  }).where(and(eq(newVehicleRequests.id, id), eq(newVehicleRequests.status, 'pending'))).returning()
  if (!claimed) throw new PortalRequestReviewError('NOT_PENDING')

  try {
    const vehicle = await createVehicle(db, {
      customerId: claimed.customerId,
      unitType: claimed.unitType,
      busNumber: claimed.fleetTag,
      vin: claimed.vin,
      year: claimed.year,
      make: claimed.make,
      model: claimed.model,
      notes: [claimed.notes, reason?.trim() ? `Staff note: ${reason.trim()}` : null].filter(Boolean).join('\n') || null,
    }, actorId)

    const [row] = await db.update(newVehicleRequests).set({
      resultVehicleId: vehicle.id,
    }).where(eq(newVehicleRequests.id, id)).returning()

    await notifyPortalRequestStatus(db, 'new_vehicle', row!, 'approved').catch(() => {})
    return { request: row!, vehicle }
  }
  catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'DUPLICATE_BUS_NUMBER') {
      throw new PortalRequestReviewError('DUPLICATE_BUS_NUMBER')
    }
    throw err
  }
}

export async function approvePortalRequest(
  db: Db,
  kind: PortalRequestReviewKind,
  id: string,
  actorId: string,
  reason?: string | null,
) {
  switch (kind) {
    case 'service': return approveServiceRequest(db, id, actorId, reason)
    case 'invoice_change': return approveInvoiceChangeRequest(db, id, actorId, reason)
    case 'vehicle_change': return approveVehicleChangeRequest(db, id, actorId, reason)
    case 'general': return approveGeneralRequest(db, id, actorId, reason)
    case 'new_vehicle': return approveNewVehicleRequest(db, id, actorId, reason)
    default: throw new PortalRequestReviewError('NOT_FOUND')
  }
}
