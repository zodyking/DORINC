import { and, asc, count, desc, eq, gt, ilike, isNull, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { EstimateCreationSource, EstimateStatus } from '../db/schema/estimates'
import {
  estimateLineItems,
  estimates,
  formatEstimateNumber,
} from '../db/schema/estimates'
import { customers } from '../db/schema/customers'
import { vehicles } from '../db/schema/vehicles'
import { invoiceLineItems } from '../db/schema/invoices'
import { serviceRequests } from '../db/schema/portal-requests'
import { getCustomer } from './customers.service'
import { getVehicle } from './vehicles.service'
import {
  buildCatalogSnapshot,
  createInvoiceDraft,
  recalculateInvoiceTotals,
} from './invoices.service'
import { calculateInvoiceTotals, lineAmount } from './invoice-totals.service'
import type { LineItemType } from '#shared/line-item-types'
import { normalizeLineType } from '#shared/line-item-types'
import type { InvoiceTotalsResult } from './invoice-totals.service'
import { getServiceLog, ServiceLogsServiceError } from './service-logs.service'
import { getDefaultInvoiceTaxRateDecimal, getInvoiceWorkspaceSettings } from './workspace-settings.service'

export type EstimatesServiceErrorCode
  = 'NOT_FOUND' | 'CUSTOMER_NOT_FOUND' | 'VEHICLE_NOT_FOUND' | 'CATALOG_NOT_FOUND'
    | 'SERVICE_LOG_NOT_FOUND' | 'NOT_EDITABLE' | 'INVALID_TRANSITION' | 'INVALID_CREATE'
    | 'LINE_NOT_FOUND' | 'ALREADY_CONVERTED' | 'PORTAL_DISABLED'

export class EstimatesServiceError extends Error {
  constructor(public readonly code: EstimatesServiceErrorCode) {
    super(code)
  }
}

export const ESTIMATE_TRANSITIONS: Record<EstimateStatus, EstimateStatus[]> = {
  draft: ['sent', 'void'],
  sent: ['approved', 'rejected', 'void'],
  approved: ['converted', 'void'],
  rejected: [],
  converted: [],
  expired: [],
  void: [],
}

const DRAFT_EDITABLE_STATUSES: EstimateStatus[] = ['draft']

export const PORTAL_ESTIMATE_STATUSES = ['sent', 'approved', 'rejected', 'converted'] as const

export interface CreateEstimateInput {
  customerId?: string
  vehicleId?: string | null
  serviceLogId?: string | null
  serviceRequestId?: string | null
  creationSource?: EstimateCreationSource
  estimateDate: string
  validUntil?: string | null
  serviceLocation?: string | null
  poNumber?: string | null
  complaint?: string | null
  internalNotes?: string | null
  customerNotes?: string | null
  taxRate?: string
  shopSuppliesPercent?: string | null
  feesAmount?: string
  discountAmount?: string
}

export interface EstimatePatch {
  vehicleId?: string | null
  estimateDate?: string
  validUntil?: string | null
  serviceLocation?: string | null
  poNumber?: string | null
  complaint?: string | null
  internalNotes?: string | null
  customerNotes?: string | null
  taxRate?: string
  shopSuppliesPercent?: string | null
  feesAmount?: string
  discountAmount?: string
}

export interface AddEstimateLineInput {
  lineType: LineItemType
  catalogItemId?: string | null
  description: string
  quantity: string
  unitPrice: string
  taxable?: boolean
  sortOrder?: number
}

export type UpdateEstimateLineInput = Partial<AddEstimateLineInput>

export interface ListEstimatesFilter {
  q?: string
  status?: EstimateStatus
  customerId?: string
  vehicleId?: string
  includeArchived?: boolean
  sort?: 'newest' | 'oldest' | 'estimate_date' | 'status'
  page: number
  pageSize: number
}

export interface EstimateListStats {
  total: number
  draftCount: number
  sentCount: number
  approvedCount: number
  rejectedCount: number
  convertedCount: number
  pendingCustomerCount: number
}

function buildCustomerSnapshot(customer: Awaited<ReturnType<typeof getCustomer>>) {
  return {
    displayName: customer.displayName,
    email: customer.email,
    phone: customer.phone,
    billingAddress: customer.billingAddress ?? null,
    serviceAddress: customer.serviceAddress ?? null,
    taxExempt: customer.taxExempt,
    paymentTerms: customer.paymentTerms,
  }
}

function buildVehicleSnapshot(vehicle: Awaited<ReturnType<typeof getVehicle>>) {
  return {
    unitType: vehicle.unitType,
    busNumber: vehicle.busNumber,
    unitTag: vehicle.unitTag,
    vin: vehicle.vin,
    plate: vehicle.plate,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    odometer: vehicle.odometer != null ? String(vehicle.odometer) : null,
    odometerUnit: vehicle.odometerUnit,
  }
}

async function resolveVehicleForCustomer(db: Db, customerId: string, vehicleId: string | null | undefined) {
  if (!vehicleId) return null
  try {
    const vehicle = await getVehicle(db, vehicleId)
    if (vehicle.customerId !== customerId) throw new EstimatesServiceError('VEHICLE_NOT_FOUND')
    return buildVehicleSnapshot(vehicle)
  }
  catch (err) {
    if (err instanceof EstimatesServiceError) throw err
    throw new EstimatesServiceError('VEHICLE_NOT_FOUND')
  }
}

function assertDraftEditable(estimate: { status: EstimateStatus }) {
  if (!DRAFT_EDITABLE_STATUSES.includes(estimate.status)) {
    throw new EstimatesServiceError('NOT_EDITABLE')
  }
}

export async function getEstimate(db: Db, id: string) {
  const [row] = await db.select().from(estimates).where(eq(estimates.id, id))
  if (!row) throw new EstimatesServiceError('NOT_FOUND')
  return row
}

export async function listEstimateLineItems(db: Db, estimateId: string) {
  return db.select().from(estimateLineItems)
    .where(eq(estimateLineItems.estimateId, estimateId))
    .orderBy(asc(estimateLineItems.sortOrder), asc(estimateLineItems.createdAt))
}

export async function recalculateEstimateTotals(db: Db, estimateId: string, actorId: string) {
  const estimate = await getEstimate(db, estimateId)
  const lines = await listEstimateLineItems(db, estimateId)
  const totals = calculateInvoiceTotals({
    lines: lines.map(line => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxable: line.taxable,
    })),
    taxExempt: estimate.taxExempt,
    taxRate: estimate.taxRate ?? '0',
    feesAmount: '0',
    shopSuppliesPercent: estimate.shopSuppliesPercent ?? undefined,
    discountAmount: estimate.discountAmount ?? '0',
    amountPaid: '0',
  })

  const [row] = await db.update(estimates).set({
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    feesAmount: totals.feesAmount,
    discountAmount: totals.discountAmount,
    total: totals.total,
    updatedBy: actorId,
    updatedAt: new Date(),
  }).where(eq(estimates.id, estimateId)).returning()

  return { estimate: row!, totals }
}

export async function createEstimate(db: Db, input: CreateEstimateInput, actorId: string) {
  const source = input.creationSource ?? 'blank'
  const resolved: CreateEstimateInput = { ...input, creationSource: source }

  if (source === 'vehicle') {
    if (!input.vehicleId) throw new EstimatesServiceError('INVALID_CREATE')
    const vehicle = await getVehicle(db, input.vehicleId)
    resolved.customerId = vehicle.customerId
    resolved.vehicleId = vehicle.id
  }
  else if (source === 'service_log') {
    if (!input.serviceLogId) throw new EstimatesServiceError('INVALID_CREATE')
    try {
      const log = await getServiceLog(db, input.serviceLogId)
      resolved.customerId = log.customerId
      resolved.vehicleId = log.vehicleId
      resolved.serviceLogId = log.id
      resolved.estimateDate = input.estimateDate ?? log.serviceDate
      resolved.complaint = input.complaint ?? log.complaint
      resolved.internalNotes = input.internalNotes ?? log.internalNotes
      resolved.serviceLocation = input.serviceLocation ?? log.location
    }
    catch (err) {
      if (err instanceof ServiceLogsServiceError && err.code === 'NOT_FOUND') {
        throw new EstimatesServiceError('SERVICE_LOG_NOT_FOUND')
      }
      throw err
    }
  }
  else if (source === 'service_request') {
    if (!input.serviceRequestId) throw new EstimatesServiceError('INVALID_CREATE')
    const [req] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, input.serviceRequestId))
    if (!req) throw new EstimatesServiceError('INVALID_CREATE')
    resolved.customerId = req.customerId
    resolved.vehicleId = req.vehicleId
    resolved.serviceRequestId = req.id
    resolved.complaint = input.complaint ?? req.description
    resolved.serviceLocation = input.serviceLocation ?? req.location
  }
  else if (source === 'customer' || source === 'blank') {
    if (!input.customerId) throw new EstimatesServiceError('INVALID_CREATE')
    resolved.customerId = input.customerId
  }
  else {
    if (!input.customerId) throw new EstimatesServiceError('INVALID_CREATE')
    resolved.customerId = input.customerId
  }

  if (!resolved.customerId) throw new EstimatesServiceError('INVALID_CREATE')

  let customer
  try {
    customer = await getCustomer(db, resolved.customerId)
  }
  catch {
    throw new EstimatesServiceError('CUSTOMER_NOT_FOUND')
  }

  const vehicleSnapshot = await resolveVehicleForCustomer(db, resolved.customerId, resolved.vehicleId)

  const [defaultTaxRate, invoiceSettings] = await Promise.all([
    resolved.taxRate ? Promise.resolve(resolved.taxRate) : getDefaultInvoiceTaxRateDecimal(db),
    getInvoiceWorkspaceSettings(db),
  ])

  const [row] = await db.insert(estimates).values({
    customerId: resolved.customerId,
    vehicleId: resolved.vehicleId ?? null,
    serviceLogId: resolved.serviceLogId ?? null,
    serviceRequestId: resolved.serviceRequestId ?? null,
    creationSource: source,
    estimateDate: resolved.estimateDate,
    validUntil: resolved.validUntil ?? null,
    customerSnapshot: buildCustomerSnapshot(customer),
    vehicleSnapshot,
    serviceLocation: resolved.serviceLocation ?? null,
    poNumber: resolved.poNumber ?? null,
    complaint: resolved.complaint ?? null,
    internalNotes: resolved.internalNotes ?? null,
    customerNotes: resolved.customerNotes ?? null,
    taxExempt: customer.taxExempt,
    taxRate: defaultTaxRate,
    shopSuppliesPercent: resolved.shopSuppliesPercent ?? invoiceSettings.shopSuppliesPercent ?? null,
    feesAmount: resolved.feesAmount ?? '0',
    discountAmount: resolved.discountAmount ?? '0',
    createdBy: actorId,
    updatedBy: actorId,
  }).returning()

  return row!
}

export async function getEstimateDetail(db: Db, id: string) {
  const { resolveCustomerDisplayName } = await import('./entity-snapshots')
  const [row] = await db.select({
    estimate: estimates,
    customerName: customers.displayName,
    vehicle: {
      id: vehicles.id,
      unitType: vehicles.unitType,
      busNumber: vehicles.busNumber,
      unitTag: vehicles.unitTag,
      year: vehicles.year,
      make: vehicles.make,
      model: vehicles.model,
    },
  })
    .from(estimates)
    .leftJoin(customers, eq(estimates.customerId, customers.id))
    .leftJoin(vehicles, eq(estimates.vehicleId, vehicles.id))
    .where(eq(estimates.id, id))

  if (!row) throw new EstimatesServiceError('NOT_FOUND')

  const lines = await listEstimateLineItems(db, id)

  return {
    ...row.estimate,
    estimateNumberFormatted: formatEstimateNumber(row.estimate.estimateNumber),
    customerName: resolveCustomerDisplayName(row.customerName, row.estimate.customerSnapshot),
    vehicle: row.vehicle?.id ? row.vehicle : null,
    lineItems: lines,
  }
}

function estimateListBaseConditions(filter: Pick<ListEstimatesFilter, 'includeArchived' | 'customerId' | 'vehicleId' | 'q'>) {
  const conditions = []
  if (!filter.includeArchived) conditions.push(isNull(estimates.archivedAt))
  if (filter.customerId) conditions.push(eq(estimates.customerId, filter.customerId))
  if (filter.vehicleId) conditions.push(eq(estimates.vehicleId, filter.vehicleId))

  if (filter.q) {
    const term = `%${filter.q}%`
    conditions.push(or(
      ilike(customers.displayName, term),
      ilike(vehicles.busNumber, term),
      ilike(estimates.poNumber, term),
      ilike(estimates.complaint, term),
      sql`CAST(${estimates.estimateNumber} AS TEXT) ILIKE ${term}`,
    ))
  }

  return conditions
}

export async function getEstimateListStats(db: Db): Promise<EstimateListStats> {
  const base = [isNull(estimates.archivedAt)]

  const [totals] = await db.select({ value: count() }).from(estimates).where(and(...base))
  const [draftCount] = await db.select({ value: count() })
    .from(estimates).where(and(...base, eq(estimates.status, 'draft')))
  const [sentCount] = await db.select({ value: count() })
    .from(estimates).where(and(...base, eq(estimates.status, 'sent')))
  const [approvedCount] = await db.select({ value: count() })
    .from(estimates).where(and(...base, eq(estimates.status, 'approved')))
  const [rejectedCount] = await db.select({ value: count() })
    .from(estimates).where(and(...base, eq(estimates.status, 'rejected')))
  const [convertedCount] = await db.select({ value: count() })
    .from(estimates).where(and(...base, eq(estimates.status, 'converted')))

  const today = new Date().toISOString().slice(0, 10)
  const [pendingCustomerCount] = await db.select({ value: count() })
    .from(estimates)
    .where(and(...base, eq(estimates.status, 'sent'), or(isNull(estimates.validUntil), gt(estimates.validUntil, today))))

  return {
    total: Number(totals?.value ?? 0),
    draftCount: Number(draftCount?.value ?? 0),
    sentCount: Number(sentCount?.value ?? 0),
    approvedCount: Number(approvedCount?.value ?? 0),
    rejectedCount: Number(rejectedCount?.value ?? 0),
    convertedCount: Number(convertedCount?.value ?? 0),
    pendingCustomerCount: Number(pendingCustomerCount?.value ?? 0),
  }
}

export async function listEstimates(db: Db, filter: ListEstimatesFilter) {
  const conditions = estimateListBaseConditions(filter)
  if (filter.status) conditions.push(eq(estimates.status, filter.status))

  const where = conditions.length ? and(...conditions) : undefined
  const orderBy = filter.sort === 'oldest'
    ? asc(estimates.createdAt)
    : filter.sort === 'estimate_date'
      ? desc(estimates.estimateDate)
      : filter.sort === 'status'
        ? asc(estimates.status)
        : desc(estimates.createdAt)

  const rows = await db.select({
    estimate: estimates,
    customerName: customers.displayName,
    vehicle: {
      busNumber: vehicles.busNumber,
      make: vehicles.make,
      model: vehicles.model,
    },
  })
    .from(estimates)
    .leftJoin(customers, eq(estimates.customerId, customers.id))
    .leftJoin(vehicles, eq(estimates.vehicleId, vehicles.id))
    .where(where)
    .orderBy(orderBy)
    .limit(filter.pageSize)
    .offset((filter.page - 1) * filter.pageSize)

  const [total] = await db.select({ value: count() })
    .from(estimates)
    .leftJoin(customers, eq(estimates.customerId, customers.id))
    .leftJoin(vehicles, eq(estimates.vehicleId, vehicles.id))
    .where(where)

  const { resolveCustomerDisplayName } = await import('./entity-snapshots')

  return {
    items: rows.map(r => ({
      ...r.estimate,
      estimateNumberFormatted: formatEstimateNumber(r.estimate.estimateNumber),
      customerName: resolveCustomerDisplayName(r.customerName, r.estimate.customerSnapshot),
      vehicle: r.vehicle?.busNumber ? r.vehicle : null,
    })),
    total: Number(total?.value ?? 0),
    page: filter.page,
    pageSize: filter.pageSize,
  }
}

export async function updateEstimateDraft(db: Db, id: string, patch: EstimatePatch, actorId: string) {
  const before = await getEstimate(db, id)
  assertDraftEditable(before)

  const changes: Record<string, unknown> = { updatedBy: actorId, updatedAt: new Date() }
  const changedFields: string[] = []

  if (patch.vehicleId !== undefined && patch.vehicleId !== before.vehicleId) {
    const vehicleSnapshot = await resolveVehicleForCustomer(db, before.customerId, patch.vehicleId)
    changes.vehicleId = patch.vehicleId
    changes.vehicleSnapshot = vehicleSnapshot
    changedFields.push('vehicleId', 'vehicleSnapshot')
  }

  for (const key of [
    'estimateDate', 'validUntil', 'serviceLocation', 'poNumber', 'complaint',
    'internalNotes', 'customerNotes', 'taxRate', 'shopSuppliesPercent', 'feesAmount', 'discountAmount',
  ] as const) {
    const value = patch[key]
    if (value !== undefined && JSON.stringify(value) !== JSON.stringify(before[key])) {
      changes[key] = value
      changedFields.push(key)
    }
  }

  if (!changedFields.length) return { estimate: before, before, changedFields }

  const [updated] = await db.update(estimates).set(changes).where(eq(estimates.id, id)).returning()
  const totalsFields = ['taxRate', 'shopSuppliesPercent', 'feesAmount', 'discountAmount']
  if (changedFields.some(f => totalsFields.includes(f))) {
    const { estimate } = await recalculateEstimateTotals(db, id, actorId)
    return { estimate, before, changedFields }
  }

  return { estimate: updated!, before, changedFields }
}

export async function addEstimateLineItem(
  db: Db,
  estimateId: string,
  input: AddEstimateLineInput,
  actorId: string,
) {
  const estimate = await getEstimate(db, estimateId)
  assertDraftEditable(estimate)

  let catalogSnapshot = null
  if (input.catalogItemId) {
    try {
      catalogSnapshot = await buildCatalogSnapshot(db, input.catalogItemId)
    }
    catch {
      throw new EstimatesServiceError('CATALOG_NOT_FOUND')
    }
  }

  const amount = lineAmount(input.quantity, input.unitPrice)

  const [row] = await db.insert(estimateLineItems).values({
    estimateId,
    lineType: normalizeLineType(input.lineType),
    catalogItemId: input.catalogItemId ?? null,
    catalogSnapshot,
    description: input.description.trim(),
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    lineAmount: amount,
    taxable: input.taxable ?? catalogSnapshot?.taxable ?? true,
    sortOrder: input.sortOrder ?? 0,
    createdBy: actorId,
    updatedBy: actorId,
  }).returning()

  await recalculateEstimateTotals(db, estimateId, actorId)
  return row!
}

export async function updateEstimateLineItem(
  db: Db,
  estimateId: string,
  lineId: string,
  patch: UpdateEstimateLineInput,
  actorId: string,
) {
  const estimate = await getEstimate(db, estimateId)
  assertDraftEditable(estimate)

  const [existing] = await db.select().from(estimateLineItems)
    .where(and(eq(estimateLineItems.id, lineId), eq(estimateLineItems.estimateId, estimateId)))
  if (!existing) throw new EstimatesServiceError('LINE_NOT_FOUND')

  const changes: Record<string, unknown> = { updatedBy: actorId, updatedAt: new Date() }
  const changedFields: string[] = []

  if (patch.catalogItemId !== undefined && patch.catalogItemId !== existing.catalogItemId) {
    if (patch.catalogItemId) {
      try {
        changes.catalogSnapshot = await buildCatalogSnapshot(db, patch.catalogItemId)
        changes.catalogItemId = patch.catalogItemId
      }
      catch {
        throw new EstimatesServiceError('CATALOG_NOT_FOUND')
      }
    }
    else {
      changes.catalogItemId = null
      changes.catalogSnapshot = null
    }
    changedFields.push('catalogItemId')
  }

  for (const key of ['lineType', 'description', 'quantity', 'unitPrice', 'taxable', 'sortOrder'] as const) {
    const value = patch[key]
    if (value !== undefined && JSON.stringify(value) !== JSON.stringify(existing[key])) {
      changes[key] = key === 'lineType'
        ? normalizeLineType(String(value))
        : key === 'description' && typeof value === 'string'
          ? value.trim()
          : value
      changedFields.push(key)
    }
  }

  if (!changedFields.length) return { line: existing, changedFields }

  const qty = (changes.quantity as string | undefined) ?? existing.quantity
  const price = (changes.unitPrice as string | undefined) ?? existing.unitPrice
  changes.lineAmount = lineAmount(qty, price)

  const [updated] = await db.update(estimateLineItems)
    .set(changes)
    .where(eq(estimateLineItems.id, lineId))
    .returning()

  await recalculateEstimateTotals(db, estimateId, actorId)
  return { line: updated!, changedFields }
}

export async function deleteEstimateLineItem(db: Db, estimateId: string, lineId: string, actorId: string) {
  const estimate = await getEstimate(db, estimateId)
  assertDraftEditable(estimate)

  const [existing] = await db.select().from(estimateLineItems)
    .where(and(eq(estimateLineItems.id, lineId), eq(estimateLineItems.estimateId, estimateId)))
  if (!existing) throw new EstimatesServiceError('LINE_NOT_FOUND')

  await db.delete(estimateLineItems).where(eq(estimateLineItems.id, lineId))
  await recalculateEstimateTotals(db, estimateId, actorId)
}

export async function transitionEstimate(
  db: Db,
  id: string,
  to: EstimateStatus,
  actorId: string,
) {
  const before = await getEstimate(db, id)

  if (!ESTIMATE_TRANSITIONS[before.status].includes(to)) {
    throw new EstimatesServiceError('INVALID_TRANSITION')
  }

  if (to === 'sent' || to === 'approved') {
    await recalculateEstimateTotals(db, id, actorId)
  }

  const changes: Record<string, unknown> = {
    status: to,
    updatedBy: actorId,
    updatedAt: new Date(),
  }

  if (to === 'sent') {
    changes.sentAt = new Date()
    changes.sentBy = actorId
  }
  if (to === 'approved') {
    changes.approvedAt = new Date()
    changes.approvedBy = actorId
  }

  const [row] = await db.update(estimates).set(changes).where(eq(estimates.id, id)).returning()
  return { estimate: row!, before }
}

export async function sendEstimate(db: Db, id: string, actorId: string) {
  const result = await transitionEstimate(db, id, 'sent', actorId)
  const { notifyEstimateSent } = await import('./customer-notifications.service')
  await notifyEstimateSent(db, id).catch(() => {})
  return result
}

export async function voidEstimate(db: Db, id: string, actorId: string) {
  return transitionEstimate(db, id, 'void', actorId)
}

export async function customerApproveEstimate(
  db: Db,
  estimateId: string,
  customerId: string,
  actorUserId: string,
  notes?: string | null,
) {
  const estimate = await getEstimate(db, estimateId)
  if (estimate.customerId !== customerId) throw new EstimatesServiceError('NOT_FOUND')
  if (estimate.status !== 'sent') throw new EstimatesServiceError('INVALID_TRANSITION')

  const [row] = await db.update(estimates).set({
    status: 'approved',
    customerApprovedAt: new Date(),
    customerApprovedBy: actorUserId,
    customerResponseNotes: notes?.trim() || null,
    updatedAt: new Date(),
  }).where(and(eq(estimates.id, estimateId), eq(estimates.status, 'sent'))).returning()
  if (!row) throw new EstimatesServiceError('INVALID_TRANSITION')

  return { estimate: row, before: estimate }
}

export async function customerRejectEstimate(
  db: Db,
  estimateId: string,
  customerId: string,
  actorUserId: string,
  notes?: string | null,
) {
  const estimate = await getEstimate(db, estimateId)
  if (estimate.customerId !== customerId) throw new EstimatesServiceError('NOT_FOUND')
  if (estimate.status !== 'sent') throw new EstimatesServiceError('INVALID_TRANSITION')

  const [row] = await db.update(estimates).set({
    status: 'rejected',
    customerRejectedAt: new Date(),
    customerRejectedBy: actorUserId,
    customerResponseNotes: notes?.trim() || null,
    updatedAt: new Date(),
  }).where(and(eq(estimates.id, estimateId), eq(estimates.status, 'sent'))).returning()
  if (!row) throw new EstimatesServiceError('INVALID_TRANSITION')

  return { estimate: row, before: estimate }
}

export async function convertEstimateToInvoice(
  db: Db,
  estimateId: string,
  actorId: string,
  opts: { invoiceDate?: string } = {},
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(estimates).where(eq(estimates.id, estimateId)).limit(1)
    if (!existing) throw new EstimatesServiceError('NOT_FOUND')
    if (existing.status === 'converted' || existing.convertedInvoiceId) {
      throw new EstimatesServiceError('ALREADY_CONVERTED')
    }
    if (existing.status !== 'approved') {
      throw new EstimatesServiceError('INVALID_TRANSITION')
    }
    const before = existing

    // Atomically claim approved status before invoice creation — prevents duplicate invoices.
    const [claimed] = await tx.update(estimates).set({
      status: 'converted',
      convertedAt: new Date(),
      convertedBy: actorId,
      updatedBy: actorId,
      updatedAt: new Date(),
    }).where(and(
      eq(estimates.id, estimateId),
      eq(estimates.status, 'approved'),
      isNull(estimates.convertedInvoiceId),
    )).returning()
    if (!claimed) throw new EstimatesServiceError('ALREADY_CONVERTED')

    const lines = await listEstimateLineItems(tx, estimateId)

    const invoice = await createInvoiceDraft(tx, {
      customerId: before.customerId,
      vehicleId: before.vehicleId,
      creationSource: 'estimate',
      invoiceDate: opts.invoiceDate ?? before.estimateDate,
      serviceLocation: before.serviceLocation,
      poNumber: before.poNumber,
      complaint: before.complaint,
      internalNotes: before.internalNotes,
      customerNotes: before.customerNotes,
      taxRate: before.taxRate ?? '0',
      shopSuppliesPercent: before.shopSuppliesPercent,
      feesAmount: before.feesAmount ?? '0',
      discountAmount: before.discountAmount ?? '0',
    }, actorId)

    for (const line of lines) {
      await tx.insert(invoiceLineItems).values({
        invoiceId: invoice.id,
        lineType: line.lineType,
        catalogItemId: line.catalogItemId,
        catalogSnapshot: line.catalogSnapshot,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineAmount: line.lineAmount,
        taxable: line.taxable,
        sortOrder: line.sortOrder,
        priceOverridden: line.priceOverridden,
        priceOverrideReason: line.priceOverrideReason,
        createdBy: actorId,
        updatedBy: actorId,
      })
    }

    const { invoices: invoicesTable } = await import('../db/schema/invoices')
    await tx.update(invoicesTable).set({
      estimateId: before.id,
      updatedBy: actorId,
      updatedAt: new Date(),
    }).where(eq(invoicesTable.id, invoice.id))

    await recalculateInvoiceTotals(tx, invoice.id, actorId)

    const [estimate] = await tx.update(estimates).set({
      convertedInvoiceId: invoice.id,
    }).where(eq(estimates.id, estimateId)).returning()

    const [refreshedInvoice] = await tx.select().from(invoicesTable).where(eq(invoicesTable.id, invoice.id)).limit(1)
    return { invoice: refreshedInvoice!, estimate: estimate!, before }
  })
}

function unitTypeLabel(key: string): string {
  const labels: Record<string, string> = {
    truck: 'Truck', bus: 'Bus', equipment: 'Equipment', tractor: 'Tractor', other: 'Unit',
  }
  return labels[key] ?? 'Unit'
}

function vehicleLabelFromRow(row: {
  unitType: string
  busNumber: string | null
  unitTag: string | null
} | null): string {
  if (!row) return '—'
  const type = unitTypeLabel(row.unitType)
  if (row.busNumber) return `${type} #${row.busNumber}`
  if (row.unitTag) return `${type} · ${row.unitTag}`
  return type
}

function orPortalEstimateStatuses() {
  return or(...PORTAL_ESTIMATE_STATUSES.map(s => eq(estimates.status, s)))
}

export async function listPortalEstimates(db: Db, customerId: string, limit = 50) {
  const [customer] = await db.select().from(customers)
    .where(and(eq(customers.id, customerId), isNull(customers.archivedAt)))
  if (!customer) throw new EstimatesServiceError('NOT_FOUND')
  if (!customer.portalEnabled) throw new EstimatesServiceError('PORTAL_DISABLED')

  const rows = await db.select({
    estimate: estimates,
    vehicle: {
      unitType: vehicles.unitType,
      busNumber: vehicles.busNumber,
      unitTag: vehicles.unitTag,
    },
  })
    .from(estimates)
    .leftJoin(vehicles, eq(estimates.vehicleId, vehicles.id))
    .where(and(
      eq(estimates.customerId, customerId),
      isNull(estimates.archivedAt),
      orPortalEstimateStatuses(),
    ))
    .orderBy(desc(estimates.estimateDate), desc(estimates.createdAt))
    .limit(limit)

  return rows.map(r => ({
    id: r.estimate.id,
    estimateNumberFormatted: formatEstimateNumber(r.estimate.estimateNumber),
    status: r.estimate.status,
    estimateDate: r.estimate.estimateDate,
    validUntil: r.estimate.validUntil,
    total: r.estimate.total,
    vehicleLabel: vehicleLabelFromRow(r.vehicle?.busNumber || r.vehicle?.unitTag ? r.vehicle : null),
    canRespond: r.estimate.status === 'sent',
  }))
}

export async function getPortalEstimateDetail(db: Db, customerId: string, estimateId: string) {
  const [row] = await db.select({
    estimate: estimates,
    vehicle: {
      unitType: vehicles.unitType,
      busNumber: vehicles.busNumber,
      unitTag: vehicles.unitTag,
      year: vehicles.year,
      make: vehicles.make,
      model: vehicles.model,
    },
  })
    .from(estimates)
    .leftJoin(vehicles, eq(estimates.vehicleId, vehicles.id))
    .where(and(eq(estimates.id, estimateId), isNull(estimates.archivedAt)))
    .limit(1)

  if (!row) throw new EstimatesServiceError('NOT_FOUND')
  if (row.estimate.customerId !== customerId) throw new EstimatesServiceError('NOT_FOUND')
  if (!PORTAL_ESTIMATE_STATUSES.includes(row.estimate.status as typeof PORTAL_ESTIMATE_STATUSES[number])) {
    throw new EstimatesServiceError('NOT_FOUND')
  }

  const lines = await listEstimateLineItems(db, estimateId)

  return {
    id: row.estimate.id,
    estimateNumberFormatted: formatEstimateNumber(row.estimate.estimateNumber),
    status: row.estimate.status,
    estimateDate: row.estimate.estimateDate,
    validUntil: row.estimate.validUntil,
    total: row.estimate.total,
    subtotal: row.estimate.subtotal,
    taxAmount: row.estimate.taxAmount,
    feesAmount: row.estimate.feesAmount,
    discountAmount: row.estimate.discountAmount,
    customerNotes: row.estimate.customerNotes,
    vehicleLabel: vehicleLabelFromRow(row.vehicle?.busNumber || row.vehicle?.unitTag ? row.vehicle : null),
    vehicle: row.vehicle?.busNumber || row.vehicle?.unitTag || row.vehicle?.make
      ? {
          unitType: row.vehicle.unitType,
          busNumber: row.vehicle.busNumber,
          unitTag: row.vehicle.unitTag,
          year: row.vehicle.year,
          make: row.vehicle.make,
          model: row.vehicle.model,
        }
      : null,
    canRespond: row.estimate.status === 'sent',
    convertedInvoiceId: row.estimate.convertedInvoiceId,
    lineItems: lines.map(line => ({
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      lineAmount: line.lineAmount,
      lineType: line.lineType,
    })),
  }
}

export type { InvoiceTotalsResult }
