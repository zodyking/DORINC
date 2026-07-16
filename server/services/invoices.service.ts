import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import type {
  CatalogSnapshot,
  InvoiceCreationSource,
  InvoiceCustomerSnapshot,
  InvoiceStatus,
  InvoiceVehicleSnapshot,
} from '../db/schema/invoices'
import { formatInvoiceNumber, invoiceLineItems, invoices } from '../db/schema/invoices'
import { customers } from '../db/schema/customers'
import { vehicles } from '../db/schema/vehicles'
import { getCatalogItem } from './catalog.service'
import { getCustomer } from './customers.service'
import { addMoney, compareMoney, isZeroMoney, subtractMoney } from '../../shared/money'
import type { LineItemType } from '#shared/line-item-types'
import { normalizeLineType } from '#shared/line-item-types'
import type { AccountType } from '../../shared/permissions/keys'
import { getManagerApprovalThreshold } from './billing-settings.service'
import { calculateInvoiceTotals, lineAmount } from './invoice-totals.service'
import { getServiceLog, ServiceLogsServiceError } from './service-logs.service'
import { getVehicle, VehiclesServiceError } from './vehicles.service'
import { users } from '../db/schema/auth'
import { serviceRequests } from '../db/schema/portal-requests'
import { serviceLogs } from '../db/schema/service-logs'
import { appFiles } from '../db/schema/files'
import { USER_UPLOAD_FILE_KINDS } from '../../shared/files'

export type InvoicesServiceErrorCode
  = 'NOT_FOUND' | 'CUSTOMER_NOT_FOUND' | 'VEHICLE_NOT_FOUND' | 'CATALOG_NOT_FOUND'
    | 'SERVICE_LOG_NOT_FOUND' | 'SOURCE_NOT_FOUND' | 'NOT_EDITABLE' | 'INVALID_TRANSITION'
    | 'INVALID_CREATE' | 'LINE_NOT_FOUND' | 'INVALID_PAYMENT' | 'OVERPAYMENT'
    | 'MANAGER_APPROVAL_REQUIRED'

export class InvoicesServiceError extends Error {
  constructor(public readonly code: InvoicesServiceErrorCode) {
    super(code)
  }
}

/** Allowed status transitions (SPEC §6.5). */
export const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ['pending_manager_approval', 'sent'],
  pending_manager_approval: ['sent'],
  sent: ['paid'],
  paid: [],
  void: [],
}

/** Only draft invoices may be edited. */
export const DRAFT_EDITABLE_STATUSES: InvoiceStatus[] = ['draft']

/** Statuses eligible for correction via revision. */
export const REVISION_SOURCE_STATUSES: InvoiceStatus[] = ['sent', 'paid']

/** Statuses from which an invoice may be emailed to the customer. */
export const INVOICE_SENDABLE_STATUSES: InvoiceStatus[] = ['draft', 'pending_manager_approval']

export interface CreateInvoiceInput {
  customerId?: string
  vehicleId?: string | null
  serviceLogId?: string | null
  serviceRequestId?: string | null
  sourceInvoiceId?: string | null
  creationSource?: InvoiceCreationSource
  invoiceDate: string
  dueDate?: string | null
  paymentTerms?: string
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

export interface InvoicePatch {
  customerId?: string
  vehicleId?: string | null
  vehicleSnapshot?: InvoiceVehicleSnapshot | null
  invoiceDate?: string
  dueDate?: string | null
  paymentTerms?: string
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

export interface AddInvoiceLineInput {
  lineType: LineItemType
  catalogItemId?: string | null
  description: string
  quantity: string
  unitPrice: string
  taxable?: boolean
  sortOrder?: number
  priceOverridden?: boolean
  priceOverrideReason?: string | null
}

export type UpdateInvoiceLineInput = Partial<AddInvoiceLineInput>

export interface ListInvoicesFilter {
  q?: string
  status?: InvoiceStatus
  overdue?: boolean
  customerId?: string
  vehicleId?: string
  includeArchived?: boolean
  sort?: 'newest' | 'oldest' | 'invoice_date' | 'status'
  page: number
  pageSize: number
}

export interface InvoiceListStats {
  total: number
  draftCount: number
  pendingManagerApprovalCount: number
  sentCount: number
  paidCount: number
  overdueCount: number
  outstandingTotal: string
  outstandingCount: number
  paidThisMonthTotal: string
  overdueTotal: string
}

const MANAGER_APPROVAL_ACCOUNT_TYPES: AccountType[] = ['manager', 'admin', 'super_admin']

export function canManagerApproveInvoices(accountType?: AccountType | string | null): boolean {
  return !!accountType && MANAGER_APPROVAL_ACCOUNT_TYPES.includes(accountType as AccountType)
}

function buildCustomerSnapshot(customer: Awaited<ReturnType<typeof getCustomer>>): InvoiceCustomerSnapshot {
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

function buildVehicleSnapshot(vehicle: Awaited<ReturnType<typeof getVehicle>>): InvoiceVehicleSnapshot {
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

export async function buildCatalogSnapshot(db: Db, catalogItemId: string): Promise<CatalogSnapshot> {
  const item = await getCatalogItem(db, catalogItemId)
  return {
    catalogItemId: item.id,
    itemType: item.itemType,
    sku: item.sku,
    name: item.name,
    description: item.description,
    defaultPrice: item.defaultPrice,
    taxable: item.taxable,
    uom: item.uom,
    categoryName: item.categoryName,
    capturedAt: new Date().toISOString(),
  }
}

function assertDraftEditable(invoice: { status: InvoiceStatus }) {
  if (!DRAFT_EDITABLE_STATUSES.includes(invoice.status)) {
    throw new InvoicesServiceError('NOT_EDITABLE')
  }
}

async function resolveVehicleForCustomer(
  db: Db,
  customerId: string | null | undefined,
  vehicleId: string | null | undefined,
) {
  if (!vehicleId) return null
  try {
    const vehicle = await getVehicle(db, vehicleId)
    if (customerId && vehicle.customerId !== customerId) throw new InvoicesServiceError('VEHICLE_NOT_FOUND')
    return buildVehicleSnapshot(vehicle)
  }
  catch (err) {
    if (err instanceof InvoicesServiceError) throw err
    if (err instanceof VehiclesServiceError) throw new InvoicesServiceError('VEHICLE_NOT_FOUND')
    throw new InvoicesServiceError('VEHICLE_NOT_FOUND')
  }
}

interface InvoiceDraftSnapshotOverrides {
  customerSnapshot?: InvoiceCustomerSnapshot
  vehicleSnapshot?: InvoiceVehicleSnapshot | null
}

async function copyLineItems(db: Db, sourceInvoiceId: string, targetInvoiceId: string, actorId: string) {
  const lines = await listInvoiceLineItems(db, sourceInvoiceId)
  for (const line of lines) {
    await db.insert(invoiceLineItems).values({
      invoiceId: targetInvoiceId,
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
}

export async function createInvoice(db: Db, input: CreateInvoiceInput, actorId: string) {
  const source = input.creationSource ?? 'blank'
  let resolved: CreateInvoiceInput = { ...input, creationSource: source }

  if (source === 'duplicate' || source === 'revision') {
    if (!input.sourceInvoiceId) throw new InvoicesServiceError('INVALID_CREATE')
    const src = await getInvoice(db, input.sourceInvoiceId)
    if (source === 'revision' && !REVISION_SOURCE_STATUSES.includes(src.status)) {
      throw new InvoicesServiceError('INVALID_TRANSITION')
    }
    resolved = {
      ...resolved,
      customerId: src.customerId,
      vehicleId: src.vehicleId,
      serviceLogId: src.serviceLogId,
      invoiceDate: input.invoiceDate ?? src.invoiceDate,
      dueDate: input.dueDate ?? src.dueDate,
      paymentTerms: input.paymentTerms ?? src.paymentTerms,
      serviceLocation: input.serviceLocation ?? src.serviceLocation,
      poNumber: input.poNumber ?? src.poNumber,
      complaint: input.complaint ?? src.complaint,
      internalNotes: input.internalNotes ?? src.internalNotes,
      customerNotes: input.customerNotes ?? src.customerNotes,
      taxRate: input.taxRate ?? src.taxRate ?? '0',
      shopSuppliesPercent: input.shopSuppliesPercent ?? src.shopSuppliesPercent,
      feesAmount: input.feesAmount ?? src.feesAmount ?? '0',
      discountAmount: input.discountAmount ?? src.discountAmount ?? '0',
      sourceInvoiceId: src.id,
    }
  }
  else if (source === 'vehicle') {
    if (!input.vehicleId) throw new InvoicesServiceError('INVALID_CREATE')
    const vehicle = await getVehicle(db, input.vehicleId)
    resolved.customerId = vehicle.customerId
    resolved.vehicleId = vehicle.id
  }
  else if (source === 'service_log') {
    if (!input.serviceLogId) throw new InvoicesServiceError('INVALID_CREATE')
    try {
      const log = await getServiceLog(db, input.serviceLogId)
      if (!log.customerId && !log.customerSnapshot) throw new InvoicesServiceError('INVALID_CREATE')
      resolved.customerId = log.customerId ?? undefined
      resolved.vehicleId = log.vehicleId
      resolved.serviceLogId = log.id
      resolved.invoiceDate = input.invoiceDate ?? log.serviceDate
      resolved.complaint = input.complaint ?? log.complaint
      resolved.internalNotes = input.internalNotes ?? log.internalNotes
      resolved.serviceLocation = input.serviceLocation ?? log.location

      let draftSnapshots: InvoiceDraftSnapshotOverrides | undefined
      if (!log.customerId && log.customerSnapshot) {
        draftSnapshots = { customerSnapshot: log.customerSnapshot }
      }

      let vehicleSnapshot: InvoiceVehicleSnapshot | null = null
      if (log.vehicleId) {
        try {
          vehicleSnapshot = await resolveVehicleForCustomer(db, log.customerId, log.vehicleId)
        }
        catch (err) {
          if (err instanceof InvoicesServiceError && err.code === 'VEHICLE_NOT_FOUND' && log.vehicleSnapshot) {
            vehicleSnapshot = log.vehicleSnapshot
          }
          else {
            throw err
          }
        }
      }
      else {
        vehicleSnapshot = log.vehicleSnapshot ?? null
      }
      draftSnapshots = { ...draftSnapshots, vehicleSnapshot }

      if (!resolved.customerId && !draftSnapshots?.customerSnapshot) {
        throw new InvoicesServiceError('INVALID_CREATE')
      }

      const invoice = await createInvoiceDraft(db, resolved, actorId, draftSnapshots)
      return invoice
    }
    catch (err) {
      if (err instanceof ServiceLogsServiceError && err.code === 'NOT_FOUND') {
        throw new InvoicesServiceError('SERVICE_LOG_NOT_FOUND')
      }
      throw err
    }
  }
  else if (source === 'service_request') {
    if (!input.serviceRequestId) throw new InvoicesServiceError('INVALID_CREATE')
    const [req] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, input.serviceRequestId))
    if (!req) throw new InvoicesServiceError('INVALID_CREATE')
    resolved.customerId = req.customerId
    resolved.vehicleId = req.vehicleId
    resolved.serviceRequestId = req.id
    resolved.complaint = input.complaint ?? req.description
    resolved.serviceLocation = input.serviceLocation ?? req.location
    resolved.internalNotes = input.internalNotes ?? null
  }
  else if (source === 'customer' || source === 'blank') {
    if (!input.customerId) throw new InvoicesServiceError('INVALID_CREATE')
    resolved.customerId = input.customerId
  }
  else {
    if (!input.customerId) throw new InvoicesServiceError('INVALID_CREATE')
    resolved.customerId = input.customerId
  }

  if (!resolved.customerId) throw new InvoicesServiceError('INVALID_CREATE')

  const invoice = await createInvoiceDraft(db, resolved, actorId)

  if (source === 'duplicate' || source === 'revision') {
    await copyLineItems(db, input.sourceInvoiceId!, invoice.id, actorId)
    await recalculateInvoiceTotals(db, invoice.id, actorId)
    return getInvoice(db, invoice.id)
  }

  return invoice
}

export async function createInvoiceDraft(
  db: Db,
  input: CreateInvoiceInput,
  actorId: string,
  snapshotOverrides?: InvoiceDraftSnapshotOverrides,
) {
  let customerSnapshot: InvoiceCustomerSnapshot
  let paymentTerms: string
  let taxExempt: boolean

  if (snapshotOverrides?.customerSnapshot) {
    customerSnapshot = snapshotOverrides.customerSnapshot
    paymentTerms = input.paymentTerms ?? snapshotOverrides.customerSnapshot.paymentTerms
    taxExempt = snapshotOverrides.customerSnapshot.taxExempt
  }
  else {
    let customer
    try {
      customer = await getCustomer(db, input.customerId!)
    }
    catch {
      throw new InvoicesServiceError('CUSTOMER_NOT_FOUND')
    }
    customerSnapshot = buildCustomerSnapshot(customer)
    paymentTerms = input.paymentTerms ?? customer.paymentTerms
    taxExempt = customer.taxExempt
  }

  const vehicleSnapshot = snapshotOverrides?.vehicleSnapshot !== undefined
    ? snapshotOverrides.vehicleSnapshot
    : await resolveVehicleForCustomer(db, input.customerId, input.vehicleId)

  const [row] = await db.insert(invoices).values({
    customerId: input.customerId ?? null,
    vehicleId: input.vehicleId ?? null,
    serviceLogId: input.serviceLogId ?? null,
    serviceRequestId: input.serviceRequestId ?? null,
    sourceInvoiceId: input.sourceInvoiceId ?? null,
    creationSource: input.creationSource ?? 'blank',
    invoiceDate: input.invoiceDate,
    dueDate: input.dueDate ?? null,
    paymentTerms: input.paymentTerms ?? paymentTerms,
    customerSnapshot,
    vehicleSnapshot,
    serviceLocation: input.serviceLocation ?? null,
    poNumber: input.poNumber ?? null,
    complaint: input.complaint ?? null,
    internalNotes: input.internalNotes ?? null,
    customerNotes: input.customerNotes ?? null,
    taxExempt,
    taxRate: input.taxRate ?? '0',
    shopSuppliesPercent: input.shopSuppliesPercent ?? null,
    feesAmount: input.feesAmount ?? '0',
    discountAmount: input.discountAmount ?? '0',
    createdBy: actorId,
    updatedBy: actorId,
  }).returning()

  return row!
}

export async function duplicateInvoice(db: Db, sourceInvoiceId: string, actorId: string, invoiceDate?: string) {
  return createInvoice(db, {
    creationSource: 'duplicate',
    sourceInvoiceId,
    customerId: undefined,
    invoiceDate: invoiceDate ?? new Date().toISOString().slice(0, 10),
  }, actorId)
}

export async function createInvoiceRevision(db: Db, sourceInvoiceId: string, actorId: string, invoiceDate?: string) {
  return createInvoice(db, {
    creationSource: 'revision',
    sourceInvoiceId,
    customerId: undefined,
    invoiceDate: invoiceDate ?? new Date().toISOString().slice(0, 10),
  }, actorId)
}

export async function getInvoice(db: Db, id: string) {
  const [row] = await db.select().from(invoices).where(eq(invoices.id, id))
  if (!row) throw new InvoicesServiceError('NOT_FOUND')
  return row
}

export async function getInvoiceDetail(db: Db, id: string) {
  const { resolveCustomerDisplayName, resolveVehicleDisplay } = await import('./entity-snapshots')
  const [row] = await db.select({
    invoice: invoices,
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
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .leftJoin(vehicles, eq(invoices.vehicleId, vehicles.id))
    .where(eq(invoices.id, id))

  if (!row) throw new InvoicesServiceError('NOT_FOUND')

  const lines = await listInvoiceLineItems(db, id)

  let customerName: string
  try {
    customerName = resolveCustomerDisplayName(row.customerName, row.invoice.customerSnapshot)
  }
  catch {
    customerName = row.invoice.customerSnapshot?.displayName || row.customerName || 'Customer'
  }

  const liveVehicle = row.vehicle?.id
    ? {
        unitType: row.vehicle.unitType,
        busNumber: row.vehicle.busNumber,
        unitTag: row.vehicle.unitTag,
        year: row.vehicle.year,
        make: row.vehicle.make,
        model: row.vehicle.model,
      }
    : null

  let vehicleSnapshot: ReturnType<typeof resolveVehicleDisplay>
  try {
    vehicleSnapshot = resolveVehicleDisplay(liveVehicle, row.invoice.vehicleSnapshot)
  }
  catch {
    vehicleSnapshot = row.invoice.vehicleSnapshot ?? null
  }

  return {
    ...row.invoice,
    invoiceNumberFormatted: formatInvoiceNumber(row.invoice.invoiceNumber),
    customerName,
    vehicleSnapshot,
    vehicle: row.vehicle?.id ? row.vehicle : null,
    lineItems: lines,
  }
}

export async function listInvoiceLineItems(db: Db, invoiceId: string) {
  return db.select().from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId))
    .orderBy(asc(invoiceLineItems.sortOrder), asc(invoiceLineItems.createdAt))
}

function invoiceListBaseConditions(filter: Pick<ListInvoicesFilter, 'includeArchived' | 'customerId' | 'vehicleId' | 'q'>) {
  const conditions = []
  if (!filter.includeArchived) conditions.push(isNull(invoices.archivedAt))
  if (filter.customerId) conditions.push(eq(invoices.customerId, filter.customerId))
  if (filter.vehicleId) conditions.push(eq(invoices.vehicleId, filter.vehicleId))

  if (filter.q) {
    const term = `%${filter.q}%`
    conditions.push(or(
      ilike(customers.displayName, term),
      ilike(vehicles.busNumber, term),
      ilike(invoices.poNumber, term),
      ilike(invoices.complaint, term),
      sql`CAST(${invoices.invoiceNumber} AS TEXT) ILIKE ${term}`,
    ))
  }

  return conditions
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function getInvoiceListStats(db: Db): Promise<InvoiceListStats> {
  const today = todayIsoDate()
  const monthStart = `${today.slice(0, 7)}-01`

  // One pass over invoices — avoids 8 sequential count/sum queries on large imports.
  const [row] = await db.select({
    total: count(),
    draftCount: sql<number>`count(*) filter (where ${invoices.status} = 'draft')`,
    pendingManagerApprovalCount: sql<number>`count(*) filter (where ${invoices.status} = 'pending_manager_approval')`,
    sentCount: sql<number>`count(*) filter (where ${invoices.status} = 'sent')`,
    paidCount: sql<number>`count(*) filter (where ${invoices.status} = 'paid')`,
    overdueCount: sql<number>`count(*) filter (
      where ${invoices.status} = 'sent'
        and ${invoices.dueDate} < ${today}
        and ${invoices.balanceDue} > 0
    )`,
    outstandingCount: sql<number>`count(*) filter (
      where ${invoices.status} = 'sent'
        and ${invoices.balanceDue} > 0
    )`,
    outstandingTotal: sql<string>`coalesce(sum(${invoices.balanceDue}) filter (
      where ${invoices.status} = 'sent'
        and ${invoices.balanceDue} > 0
    ), 0)`,
    overdueTotal: sql<string>`coalesce(sum(${invoices.balanceDue}) filter (
      where ${invoices.status} = 'sent'
        and ${invoices.dueDate} < ${today}
        and ${invoices.balanceDue} > 0
    ), 0)`,
    paidThisMonthTotal: sql<string>`coalesce(sum(${invoices.amountPaid}) filter (
      where ${invoices.status} = 'paid'
        and ${invoices.paidAt} >= ${monthStart}::timestamptz
    ), 0)`,
  })
    .from(invoices)
    .where(isNull(invoices.archivedAt))

  return {
    total: Number(row?.total ?? 0),
    draftCount: Number(row?.draftCount ?? 0),
    pendingManagerApprovalCount: Number(row?.pendingManagerApprovalCount ?? 0),
    sentCount: Number(row?.sentCount ?? 0),
    paidCount: Number(row?.paidCount ?? 0),
    overdueCount: Number(row?.overdueCount ?? 0),
    outstandingCount: Number(row?.outstandingCount ?? 0),
    outstandingTotal: String(row?.outstandingTotal ?? '0'),
    paidThisMonthTotal: String(row?.paidThisMonthTotal ?? '0'),
    overdueTotal: String(row?.overdueTotal ?? '0'),
  }
}

export async function listInvoices(db: Db, filter: ListInvoicesFilter) {
  const conditions = invoiceListBaseConditions(filter)

  if (filter.overdue) {
    conditions.push(eq(invoices.status, 'sent'))
    conditions.push(lt(invoices.dueDate, todayIsoDate()))
    conditions.push(gt(invoices.balanceDue, '0'))
  }
  else if (filter.status) {
    conditions.push(eq(invoices.status, filter.status))
  }

  const where = conditions.length ? and(...conditions) : undefined
  const orderBy = filter.sort === 'oldest'
    ? asc(invoices.createdAt)
    : filter.sort === 'invoice_date'
      ? desc(invoices.invoiceDate)
      : filter.sort === 'status'
        ? asc(invoices.status)
        : desc(invoices.createdAt)

  const rows = await db.select({
    invoice: invoices,
    customerName: customers.displayName,
    serviceLogNumber: serviceLogs.logNumber,
    serviceLogSubmitterName: users.name,
    vehicle: {
      busNumber: vehicles.busNumber,
      make: vehicles.make,
      model: vehicles.model,
    },
  })
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .leftJoin(vehicles, eq(invoices.vehicleId, vehicles.id))
    .leftJoin(serviceLogs, eq(invoices.serviceLogId, serviceLogs.id))
    .leftJoin(users, eq(serviceLogs.submittedBy, users.id))
    .where(where)
    .orderBy(orderBy)
    .limit(filter.pageSize)
    .offset((filter.page - 1) * filter.pageSize)

  const [total] = await db.select({ value: count() })
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .leftJoin(vehicles, eq(invoices.vehicleId, vehicles.id))
    .where(where)

  const serviceLogIds = rows
    .map(r => r.invoice.serviceLogId)
    .filter((id): id is string => !!id)
  const serviceLogPhotoCounts = new Map<string, number>()
  if (serviceLogIds.length) {
    const counts = await db.select({
      ownerId: appFiles.ownerEntityId,
      value: count(),
    })
      .from(appFiles)
      .where(and(
        eq(appFiles.ownerEntityType, 'service_log'),
        inArray(appFiles.fileKind, [...USER_UPLOAD_FILE_KINDS]),
        isNull(appFiles.archivedAt),
        inArray(appFiles.ownerEntityId, serviceLogIds),
      ))
      .groupBy(appFiles.ownerEntityId)
    for (const c of counts) serviceLogPhotoCounts.set(c.ownerId, Number(c.value))
  }

  const { resolveCustomerDisplayName, resolveVehicleDisplay } = await import('./entity-snapshots')

  return {
    items: rows.map((r) => {
      let customerName: string
      try {
        customerName = resolveCustomerDisplayName(r.customerName, r.invoice.customerSnapshot)
      }
      catch {
        customerName = (r.invoice.customerSnapshot as { displayName?: string } | null)?.displayName
          || r.customerName
          || 'Customer'
      }
      const liveVehicle = r.vehicle?.busNumber || r.vehicle?.make
        ? {
            busNumber: r.vehicle.busNumber,
            make: r.vehicle.make,
            model: r.vehicle.model,
          }
        : null
      let vehicleSnapshot: ReturnType<typeof resolveVehicleDisplay>
      try {
        vehicleSnapshot = resolveVehicleDisplay(liveVehicle, r.invoice.vehicleSnapshot)
      }
      catch {
        vehicleSnapshot = r.invoice.vehicleSnapshot ?? null
      }
      return {
        id: r.invoice.id,
        invoiceNumber: r.invoice.invoiceNumber,
        invoiceNumberFormatted: formatInvoiceNumber(r.invoice.invoiceNumber),
        status: r.invoice.status,
        invoiceDate: r.invoice.invoiceDate,
        dueDate: r.invoice.dueDate,
        total: r.invoice.total,
        balanceDue: r.invoice.balanceDue,
        customerId: r.invoice.customerId,
        vehicleId: r.invoice.vehicleId,
        customerName,
        vehicleSnapshot,
        vehicle: liveVehicle,
        creationSource: r.invoice.creationSource,
        serviceLogId: r.invoice.serviceLogId,
        serviceLogNumber: r.serviceLogNumber ?? null,
        serviceLogSubmitterName: r.serviceLogSubmitterName ?? null,
        serviceLogPhotoCount: r.invoice.serviceLogId
          ? (serviceLogPhotoCounts.get(r.invoice.serviceLogId) ?? 0)
          : 0,
      }
    }),
    total: Number(total?.value ?? 0),
    page: filter.page,
    pageSize: filter.pageSize,
  }
}

export async function updateInvoiceDraft(db: Db, id: string, patch: InvoicePatch, actorId: string) {
  const before = await getInvoice(db, id)
  assertDraftEditable(before)

  const changes: Record<string, unknown> = { updatedBy: actorId, updatedAt: new Date() }
  const changedFields: string[] = []
  let effectiveCustomerId = before.customerId

  if (patch.customerId !== undefined && patch.customerId !== before.customerId) {
    let customer
    try {
      customer = await getCustomer(db, patch.customerId)
    }
    catch {
      throw new InvoicesServiceError('CUSTOMER_NOT_FOUND')
    }

    changes.customerId = patch.customerId
    changes.customerSnapshot = buildCustomerSnapshot(customer)
    changes.taxExempt = customer.taxExempt
    changedFields.push('customerId', 'taxExempt')
    effectiveCustomerId = patch.customerId

    if (patch.paymentTerms === undefined) {
      changes.paymentTerms = customer.paymentTerms
      changedFields.push('paymentTerms')
    }

    if (patch.vehicleId === undefined && before.vehicleId) {
      try {
        const vehicle = await getVehicle(db, before.vehicleId)
        if (vehicle.customerId !== patch.customerId) {
          changes.vehicleId = null
          changes.vehicleSnapshot = null
          changedFields.push('vehicleId')
        }
      }
      catch {
        changes.vehicleId = null
        changes.vehicleSnapshot = null
        changedFields.push('vehicleId')
      }
    }
  }

  if (patch.vehicleId !== undefined) {
    if (patch.vehicleId) {
      const vehicleSnapshot = await resolveVehicleForCustomer(db, effectiveCustomerId, patch.vehicleId)
      changes.vehicleId = patch.vehicleId
      changes.vehicleSnapshot = vehicleSnapshot
    }
    else {
      changes.vehicleId = null
      changes.vehicleSnapshot = null
    }
    changedFields.push('vehicleId')
  }

  if (patch.vehicleSnapshot !== undefined) {
    changes.vehicleSnapshot = patch.vehicleSnapshot
    changedFields.push('vehicleSnapshot')
  }

  for (const key of [
    'invoiceDate', 'dueDate', 'paymentTerms', 'serviceLocation', 'poNumber',
    'complaint', 'internalNotes', 'customerNotes', 'taxRate',
    'shopSuppliesPercent', 'feesAmount', 'discountAmount',
  ] as const) {
    const value = patch[key]
    if (value !== undefined && JSON.stringify(value) !== JSON.stringify(before[key])) {
      changes[key] = value
      changedFields.push(key)
    }
  }

  if (!changedFields.length) return { invoice: before, before, changedFields }

  const [updated] = await db.update(invoices).set(changes).where(eq(invoices.id, id)).returning()
  const totalsFields = ['taxRate', 'shopSuppliesPercent', 'feesAmount', 'discountAmount', 'customerId', 'taxExempt']
  if (changedFields.some(f => totalsFields.includes(f))) {
    await recalculateInvoiceTotals(db, id, actorId)
    const refreshed = await getInvoice(db, id)
    return { invoice: refreshed, before, changedFields }
  }

  return { invoice: updated!, before, changedFields }
}

export async function updateInvoiceDates(
  db: Db,
  id: string,
  input: { invoiceDate: string, dueDate: string | null },
  actorId: string,
) {
  const before = await getInvoice(db, id)
  if (before.status === 'void') throw new InvoicesServiceError('NOT_EDITABLE')

  const changedFields: string[] = []
  if (before.invoiceDate !== input.invoiceDate) changedFields.push('invoiceDate')
  if ((before.dueDate ?? null) !== (input.dueDate ?? null)) changedFields.push('dueDate')

  if (!changedFields.length) return { invoice: before, before, changedFields }

  const [updated] = await db.update(invoices).set({
    invoiceDate: input.invoiceDate,
    dueDate: input.dueDate ?? null,
    updatedBy: actorId,
    updatedAt: new Date(),
  }).where(eq(invoices.id, id)).returning()

  return { invoice: updated!, before, changedFields }
}

export async function addInvoiceLineItem(
  db: Db,
  invoiceId: string,
  input: AddInvoiceLineInput,
  actorId: string,
) {
  const invoice = await getInvoice(db, invoiceId)
  assertDraftEditable(invoice)

  let catalogSnapshot: CatalogSnapshot | null = null
  if (input.catalogItemId) {
    try {
      catalogSnapshot = await buildCatalogSnapshot(db, input.catalogItemId)
    }
    catch {
      throw new InvoicesServiceError('CATALOG_NOT_FOUND')
    }
  }

  const amount = lineAmount(input.quantity, input.unitPrice)

  const [row] = await db.insert(invoiceLineItems).values({
    invoiceId,
    lineType: normalizeLineType(input.lineType),
    catalogItemId: input.catalogItemId ?? null,
    catalogSnapshot,
    description: input.description.trim(),
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    lineAmount: amount,
    taxable: input.taxable ?? catalogSnapshot?.taxable ?? true,
    sortOrder: input.sortOrder ?? 0,
    priceOverridden: input.priceOverridden ?? false,
    priceOverrideReason: input.priceOverrideReason ?? null,
    createdBy: actorId,
    updatedBy: actorId,
  }).returning()

  await recalculateInvoiceTotals(db, invoiceId, actorId)
  return row!
}

export async function updateInvoiceLineItem(
  db: Db,
  invoiceId: string,
  lineId: string,
  patch: UpdateInvoiceLineInput,
  actorId: string,
) {
  const invoice = await getInvoice(db, invoiceId)
  assertDraftEditable(invoice)

  const [existing] = await db.select().from(invoiceLineItems)
    .where(and(eq(invoiceLineItems.id, lineId), eq(invoiceLineItems.invoiceId, invoiceId)))
  if (!existing) throw new InvoicesServiceError('LINE_NOT_FOUND')

  const changes: Record<string, unknown> = { updatedBy: actorId, updatedAt: new Date() }
  const changedFields: string[] = []

  if (patch.catalogItemId !== undefined && patch.catalogItemId !== existing.catalogItemId) {
    if (patch.catalogItemId) {
      try {
        changes.catalogSnapshot = await buildCatalogSnapshot(db, patch.catalogItemId)
        changes.catalogItemId = patch.catalogItemId
      }
      catch {
        throw new InvoicesServiceError('CATALOG_NOT_FOUND')
      }
    }
    else {
      changes.catalogItemId = null
      changes.catalogSnapshot = null
    }
    changedFields.push('catalogItemId')
  }

  for (const key of [
    'lineType', 'description', 'quantity', 'unitPrice', 'taxable',
    'sortOrder', 'priceOverridden', 'priceOverrideReason',
  ] as const) {
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

  const [updated] = await db.update(invoiceLineItems)
    .set(changes)
    .where(eq(invoiceLineItems.id, lineId))
    .returning()

  await recalculateInvoiceTotals(db, invoiceId, actorId)
  return { line: updated!, changedFields, before: existing }
}

export async function deleteInvoiceLineItem(db: Db, invoiceId: string, lineId: string, actorId: string) {
  const invoice = await getInvoice(db, invoiceId)
  assertDraftEditable(invoice)

  const [existing] = await db.select().from(invoiceLineItems)
    .where(and(eq(invoiceLineItems.id, lineId), eq(invoiceLineItems.invoiceId, invoiceId)))
  if (!existing) throw new InvoicesServiceError('LINE_NOT_FOUND')

  await db.delete(invoiceLineItems).where(eq(invoiceLineItems.id, lineId))
  await recalculateInvoiceTotals(db, invoiceId, actorId)
  return { deleted: existing }
}

export async function recalculateInvoiceTotals(db: Db, invoiceId: string, actorId: string) {
  const invoice = await getInvoice(db, invoiceId)
  const lines = await listInvoiceLineItems(db, invoiceId)

  const totals = calculateInvoiceTotals({
    lines: lines.map(line => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxable: line.taxable,
    })),
    taxExempt: invoice.taxExempt,
    taxRate: invoice.taxRate ?? '0',
    shopSuppliesPercent: invoice.shopSuppliesPercent ?? undefined,
    // feesAmount column stores computed output — flat header fees land via draft patch before recalc
    feesAmount: '0',
    discountAmount: invoice.discountAmount ?? '0',
    amountPaid: invoice.amountPaid ?? '0',
  })

  const [updated] = await db.update(invoices).set({
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    discountAmount: totals.discountAmount,
    feesAmount: totals.feesAmount,
    total: totals.total,
    balanceDue: totals.balanceDue,
    updatedBy: actorId,
    updatedAt: new Date(),
  }).where(eq(invoices.id, invoiceId)).returning()

  return { invoice: updated!, totals }
}

export async function transitionInvoice(
  db: Db,
  id: string,
  to: InvoiceStatus,
  actorId: string,
  opts: { amountPaid?: string, paidAt?: Date } = {},
) {
  const before = await getInvoice(db, id)

  if (!INVOICE_TRANSITIONS[before.status].includes(to)) {
    throw new InvoicesServiceError('INVALID_TRANSITION')
  }

  const changes: Record<string, unknown> = {
    status: to,
    updatedBy: actorId,
    updatedAt: new Date(),
  }

  if (to === 'pending_manager_approval') {
    changes.submittedForApprovalAt = new Date()
    changes.submittedForApprovalBy = actorId
  }

  if (to === 'sent') {
    if (before.status === 'draft' || before.status === 'pending_manager_approval') {
      await recalculateInvoiceTotals(db, id, actorId)
    }
    changes.approvedBy = actorId
    changes.approvedAt = new Date()
    changes.sentAt = new Date()
  }
  if (to === 'paid') {
    const refreshed = await getInvoice(db, id)
    const amountPaid = opts.amountPaid ?? refreshed.total
    const totals = calculateInvoiceTotals({
      lines: (await listInvoiceLineItems(db, id)).map(line => ({
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxable: line.taxable,
      })),
      taxExempt: refreshed.taxExempt,
      taxRate: refreshed.taxRate ?? '0',
      shopSuppliesPercent: refreshed.shopSuppliesPercent ?? undefined,
      feesAmount: '0',
      discountAmount: refreshed.discountAmount ?? '0',
      amountPaid,
    })
    changes.amountPaid = amountPaid
    changes.balanceDue = totals.balanceDue
    changes.paidAt = opts.paidAt ?? new Date()
  }

  const [updated] = await db.update(invoices).set(changes).where(eq(invoices.id, id)).returning()
  return { invoice: updated!, before }
}

export async function assertInvoiceSendable(
  db: Db,
  invoice: Awaited<ReturnType<typeof getInvoice>>,
  actorAccountType?: AccountType | string | null,
) {
  if (!INVOICE_SENDABLE_STATUSES.includes(invoice.status)) {
    throw new InvoicesServiceError('INVALID_TRANSITION')
  }

  if (invoice.status === 'pending_manager_approval') {
    if (!canManagerApproveInvoices(actorAccountType)) {
      throw new InvoicesServiceError('MANAGER_APPROVAL_REQUIRED')
    }
    return
  }

  const threshold = await getManagerApprovalThreshold(db)
  const requiresManager = compareMoney(invoice.total, threshold) >= 0
  if (requiresManager && !canManagerApproveInvoices(actorAccountType)) {
    throw new InvoicesServiceError('MANAGER_APPROVAL_REQUIRED')
  }
}

export async function approveInvoice(
  db: Db,
  id: string,
  actorId: string,
  actorAccountType?: AccountType | string | null,
) {
  const before = await getInvoice(db, id)

  if (before.status !== 'draft') {
    throw new InvoicesServiceError('INVALID_TRANSITION')
  }

  const threshold = await getManagerApprovalThreshold(db)
  const requiresManager = compareMoney(before.total, threshold) >= 0

  if (!requiresManager) {
    throw new InvoicesServiceError('INVALID_TRANSITION')
  }

  if (canManagerApproveInvoices(actorAccountType)) {
    throw new InvoicesServiceError('INVALID_TRANSITION')
  }

  const result = await transitionInvoice(db, id, 'pending_manager_approval', actorId)
  try {
    const { notifyInvoicePendingApproval } = await import('./staff-notifications.service')
    await notifyInvoicePendingApproval(db, id, actorId)
  }
  catch (err) {
    console.warn('[mail] invoice pending approval notification failed:', (err as Error).message)
  }
  return result
}

export async function sendInvoice(
  db: Db,
  id: string,
  actorId: string,
  actorAccountType?: AccountType | string | null,
) {
  const { queueInvoiceSend } = await import('./invoice-send.service')
  const result = await queueInvoiceSend(db, id, actorId, undefined, actorAccountType)
  return { invoice: result.invoice, before: result.invoice }
}

export async function markInvoicePaid(
  db: Db,
  id: string,
  actorId: string,
  opts: {
    paymentAmount?: string
    amountPaid?: string
    paidAt?: Date
  } = {},
) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(invoices).where(eq(invoices.id, id)).for('update').limit(1)
    if (!before) throw new InvoicesServiceError('NOT_FOUND')

    if (before.status !== 'sent') {
      throw new InvoicesServiceError('INVALID_TRANSITION')
    }

    const balanceDue = before.balanceDue ?? '0'
    let paymentAmount: string
    if (opts.paymentAmount) {
      paymentAmount = opts.paymentAmount
    }
    else if (opts.amountPaid) {
      paymentAmount = subtractMoney(opts.amountPaid, before.amountPaid ?? '0')
    }
    else {
      paymentAmount = balanceDue
    }

    if (compareMoney(paymentAmount, '0') <= 0) {
      throw new InvoicesServiceError('INVALID_PAYMENT')
    }
    if (compareMoney(paymentAmount, balanceDue) > 0) {
      throw new InvoicesServiceError('OVERPAYMENT')
    }

    const newAmountPaid = addMoney(before.amountPaid ?? '0', paymentAmount)
    const lines = await listInvoiceLineItems(tx, id)
    const totals = calculateInvoiceTotals({
      lines: lines.map(line => ({
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxable: line.taxable,
      })),
      taxExempt: before.taxExempt,
      taxRate: before.taxRate ?? '0',
      shopSuppliesPercent: before.shopSuppliesPercent ?? undefined,
      feesAmount: '0',
      discountAmount: before.discountAmount ?? '0',
      amountPaid: newAmountPaid,
    })

    const changes: Record<string, unknown> = {
      amountPaid: newAmountPaid,
      balanceDue: totals.balanceDue,
      updatedBy: actorId,
      updatedAt: new Date(),
    }

    if (isZeroMoney(totals.balanceDue) || compareMoney(totals.balanceDue, '0') <= 0) {
      changes.status = 'paid'
      changes.paidAt = opts.paidAt ?? new Date()
    }

    const [updated] = await tx.update(invoices).set(changes).where(eq(invoices.id, id)).returning()
    return { invoice: updated!, before }
  })
}

function formatInvoiceExportVehicle(
  snapshot: InvoiceVehicleSnapshot | null | undefined,
): string {
  if (!snapshot || typeof snapshot !== 'object') return ''
  const parts = [
    snapshot.busNumber ? `#${snapshot.busNumber}` : null,
    [snapshot.year, snapshot.make, snapshot.model].filter(Boolean).join(' '),
    snapshot.vin?.trim() || null,
  ].filter(Boolean)
  return parts.join(' · ')
}

/** Export invoices matching list filters as CSV (respects current search/status/sort). */
export async function exportInvoicesListCsv(
  db: Db,
  filter: Omit<ListInvoicesFilter, 'page' | 'pageSize'>,
): Promise<string> {
  const { rowsToCsv } = await import('#shared/format/csv')
  const items: Awaited<ReturnType<typeof listInvoices>>['items'] = []
  let page = 1
  const pageSize = 500

  while (page <= 50) {
    const batch = await listInvoices(db, { ...filter, page, pageSize })
    items.push(...batch.items)
    if (items.length >= batch.total || !batch.items.length) break
    page++
  }

  const rows = items.map(item => ({
    invoiceNumber: item.invoiceNumberFormatted,
    customer: item.customerName,
    vehicle: formatInvoiceExportVehicle(item.vehicleSnapshot),
    status: item.status,
    invoiceDate: item.invoiceDate,
    dueDate: item.dueDate ?? '',
    total: item.total,
    balanceDue: item.balanceDue,
  }))

  return rowsToCsv(rows)
}
