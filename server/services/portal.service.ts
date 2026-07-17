import { and, count, desc, eq, gt, isNull, max, or, sql, sum } from 'drizzle-orm'
import type { Db } from '../db/client'
import { customers } from '../db/schema/customers'
import { formatInvoiceNumber, invoices } from '../db/schema/invoices'
import { newVehicleRequests, invoiceChangeRequests, portalGeneralRequests, serviceRequests, vehicleChangeRequests } from '../db/schema/portal-requests'
import { serviceLogs } from '../db/schema/service-logs'
import { vehicles } from '../db/schema/vehicles'
import { getInvoicePdfDownload, InvoicePdfServiceError } from './invoice-pdf.service'
import { getInvoice, listInvoiceLineItems } from './invoices.service'
import { buildVehicleSnapshot } from './entity-snapshots'
import { mapPortalCategoryToWorkType } from '../../shared/portal-service-log'
import { createServiceLog } from './service-logs.service'
import { getVehicle } from './vehicles.service'
import { getLatestEntityDocument } from './entity-documents.service'
import {
  buildPortalLineItemCorrectionDescription,
  buildPortalVehicleCorrectionDescription,
  type PortalInvoiceCorrectionPayload,
  type PortalVehicleCorrectionFields,
} from '../../shared/portal-invoice-correction'
import type { PortalInvoiceChangeRequestInput, PortalVehicleCorrectionInput } from '../../shared/validators/portal'
import type { InvoiceVehicleSnapshot } from '../db/schema/invoices'

/** Customer-visible invoice statuses — only mailed invoices appear in the portal. */
const PORTAL_INVOICE_STATUSES = ['sent', 'paid'] as const

export type PortalServiceErrorCode = 'NOT_FOUND' | 'PORTAL_DISABLED' | 'NO_PDF' | 'INVALID_VEHICLE' | 'INVALID_INVOICE' | 'INVALID_LINE_ITEM' | 'NO_VEHICLE' | 'INVALID_CORRECTION'

export class PortalServiceError extends Error {
  constructor(public readonly code: PortalServiceErrorCode) {
    super(code)
  }
}

export interface PortalDocumentMeta {
  id: string
  originalFilename: string
  mimeType: string
  fileSizeBytes: number
  createdAt: Date
}

export interface PortalMePayload {
  user: {
    id: string
    name: string
    email: string
    username: string | null
    mustChangePassword: boolean
  }
  company: {
    id: string
    displayName: string
    accountKind: string
    email: string | null
    phone: string | null
    taxExempt: boolean
  }
  taxExemptionDocument: PortalDocumentMeta | null
}

export interface PortalDashboardInvoice {
  id: string
  invoiceNumberFormatted: string
  sublabel: string
  vehicleLabel: string
  status: string
  total: string
  balanceDue: string
}

export interface PortalOpenRequest {
  id: string
  type: string
  title: string
  meta: string
  statusLabel: string
}

export interface PortalDashboardPayload {
  greeting: string
  subtext: string
  kpis: {
    openBalance: string
    openInvoiceCount: number
    vehicleCount: number
    paidYtdTotal: string
    paidYtdLabel: string
    pendingRequestCount: number
  }
  recentInvoices: PortalDashboardInvoice[]
  openRequests: PortalOpenRequest[]
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function greetingForHour(name: string): string {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const first = name.split(/\s+/)[0] || name
  return `Good ${part}, ${first}`
}

function paidYtdLabel(): string {
  const now = new Date()
  const month = now.toLocaleDateString('en-US', { month: 'short' })
  return `Jan – ${month} ${now.getFullYear()}`
}

function invoiceSublabel(
  status: string,
  dueDate: string | null,
  paidAt: Date | null,
): string {
  if (status === 'paid' && paidAt) {
    return `Paid ${paidAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  }
  if (dueDate) {
    const d = new Date(`${dueDate}T12:00:00`)
    return `Due ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }
  return '—'
}

function requestStatusLabel(status: string): string {
  if (status === 'pending') return 'Under review'
  if (status === 'approved') return 'Resolved'
  if (status === 'rejected') return 'Closed'
  return status
}

function customerServiceLogOpen(status: string): boolean {
  return !['converted_to_invoice', 'rejected', 'archived'].includes(status)
}

function customerServiceLogStatusLabel(status: string): string {
  if (status === 'draft') return 'Submitted to shop'
  if (['uploaded', 'ocr_processing', 'ai_processing', 'ready_for_review', 'in_review', 'needs_info'].includes(status)) {
    return 'Shop is working on it'
  }
  if (status === 'converted_to_invoice') return 'Invoiced'
  if (status === 'rejected') return 'Closed'
  if (status === 'archived') return 'Archived'
  return status
}

function formatRequestDate(iso: Date | string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

async function assertPortalVehicle(db: Db, customerId: string, vehicleId: string) {
  const [row] = await db.select({ id: vehicles.id })
    .from(vehicles)
    .where(and(
      eq(vehicles.id, vehicleId),
      eq(vehicles.customerId, customerId),
      isNull(vehicles.archivedAt),
    ))
    .limit(1)
  if (!row) throw new PortalServiceError('INVALID_VEHICLE')
}

async function assertPortalInvoiceOptional(db: Db, customerId: string, invoiceId: string | null | undefined) {
  if (!invoiceId) return
  await assertPortalInvoiceForChangeRequest(db, customerId, invoiceId)
}

async function assertPortalInvoiceForChangeRequest(db: Db, customerId: string, invoiceId: string) {
  const [row] = await db.select({
    id: invoices.id,
    customerId: invoices.customerId,
    status: invoices.status,
  })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), isNull(invoices.archivedAt)))
    .limit(1)
  if (!row || row.customerId !== customerId) throw new PortalServiceError('INVALID_INVOICE')
  if (!PORTAL_INVOICE_STATUSES.includes(row.status as typeof PORTAL_INVOICE_STATUSES[number])) {
    throw new PortalServiceError('INVALID_INVOICE')
  }
}

async function countPendingPortalRequests(db: Db, customerId: string): Promise<number> {
  const tables = [invoiceChangeRequests, vehicleChangeRequests, newVehicleRequests, portalGeneralRequests] as const
  let total = 0
  for (const table of tables) {
    const [row] = await db.select({ value: count() })
      .from(table)
      .where(and(eq(table.customerId, customerId), eq(table.status, 'pending')))
    total += Number(row?.value ?? 0)
  }

  const [legacyService] = await db.select({ value: count() })
    .from(serviceRequests)
    .where(and(eq(serviceRequests.customerId, customerId), eq(serviceRequests.status, 'pending')))

  const [openCustomerLogs] = await db.select({ value: count() })
    .from(serviceLogs)
    .where(and(
      eq(serviceLogs.customerId, customerId),
      eq(serviceLogs.customerRequested, true),
      sql`${serviceLogs.status} NOT IN ('converted_to_invoice', 'rejected', 'archived')`,
    ))

  return total + Number(legacyService?.value ?? 0) + Number(openCustomerLogs?.value ?? 0)
}

export interface PortalRequestHistoryItem {
  id: string
  kind: 'service' | 'billing' | 'vehicle_change' | 'vehicle_add' | 'general'
  title: string
  meta: string
  status: string
  statusLabel: string
  createdAt: string
  isOpen: boolean
  vehicleId: string | null
  vehicleLabel: string | null
  invoiceId: string | null
  invoiceNumberFormatted: string | null
}

export type PortalRequestKind = PortalRequestHistoryItem['kind']

export interface PortalRequestDetailPayload {
  id: string
  kind: PortalRequestKind
  status: string
  statusLabel: string
  createdAt: string
  isOpen: boolean
  reviewedAt: string | null
  reviewReason: string | null
  title: string
  vehicleId: string | null
  vehicleLabel: string | null
  invoiceId: string | null
  invoiceNumberFormatted: string | null
  serviceCategory?: string
  urgency?: string
  preferredDate?: string | null
  location?: string | null
  topic?: string
  subject?: string
  description?: string
  message?: string
  fleetTag?: string
  unitType?: string
  correctionPayload?: PortalInvoiceCorrectionPayload | null
}

export async function listPortalRequests(db: Db, customerId: string, limit = 50): Promise<PortalRequestHistoryItem[]> {
  await getPortalCustomer(db, customerId)

  const [customerLogRows, legacyServiceRows, billingRows, vehicleRows, vehicleAddRows, generalRows] = await Promise.all([
    db.select({
      log: serviceLogs,
      vehicle: {
        unitType: vehicles.unitType,
        busNumber: vehicles.busNumber,
        unitTag: vehicles.unitTag,
      },
    })
      .from(serviceLogs)
      .leftJoin(vehicles, eq(serviceLogs.vehicleId, vehicles.id))
      .where(and(eq(serviceLogs.customerId, customerId), eq(serviceLogs.customerRequested, true)))
      .orderBy(desc(serviceLogs.createdAt))
      .limit(limit),
    db.select({
      request: serviceRequests,
      vehicle: {
        unitType: vehicles.unitType,
        busNumber: vehicles.busNumber,
        unitTag: vehicles.unitTag,
      },
    })
      .from(serviceRequests)
      .innerJoin(vehicles, eq(serviceRequests.vehicleId, vehicles.id))
      .where(eq(serviceRequests.customerId, customerId))
      .orderBy(desc(serviceRequests.createdAt))
      .limit(limit),
    db.select({
      request: invoiceChangeRequests,
      invoiceNumber: invoices.invoiceNumber,
      invoiceVehicleId: invoices.vehicleId,
      vehicle: {
        unitType: vehicles.unitType,
        busNumber: vehicles.busNumber,
        unitTag: vehicles.unitTag,
      },
    })
      .from(invoiceChangeRequests)
      .leftJoin(invoices, eq(invoiceChangeRequests.invoiceId, invoices.id))
      .leftJoin(vehicles, eq(invoices.vehicleId, vehicles.id))
      .where(eq(invoiceChangeRequests.customerId, customerId))
      .orderBy(desc(invoiceChangeRequests.createdAt))
      .limit(limit),
    db.select({
      request: vehicleChangeRequests,
      vehicle: {
        unitType: vehicles.unitType,
        busNumber: vehicles.busNumber,
        unitTag: vehicles.unitTag,
      },
    })
      .from(vehicleChangeRequests)
      .innerJoin(vehicles, eq(vehicleChangeRequests.vehicleId, vehicles.id))
      .where(eq(vehicleChangeRequests.customerId, customerId))
      .orderBy(desc(vehicleChangeRequests.createdAt))
      .limit(limit),
    db.select().from(newVehicleRequests)
      .where(eq(newVehicleRequests.customerId, customerId))
      .orderBy(desc(newVehicleRequests.createdAt))
      .limit(limit),
    db.select().from(portalGeneralRequests)
      .where(eq(portalGeneralRequests.customerId, customerId))
      .orderBy(desc(portalGeneralRequests.createdAt))
      .limit(limit),
  ])

  const items: PortalRequestHistoryItem[] = []

  for (const row of customerLogRows) {
    const veh = vehicleLabelFromRow(row.vehicle)
    const titleSuffix = row.log.complaint?.trim().slice(0, 60) || workTypeLabelFromKey(row.log.workType)
    items.push({
      id: row.log.id,
      kind: 'service',
      title: `${veh} — ${titleSuffix}`,
      meta: `${formatRequestDate(row.log.createdAt)} · ${workTypeLabelFromKey(row.log.workType)}`,
      status: row.log.status,
      statusLabel: customerServiceLogStatusLabel(row.log.status),
      createdAt: row.log.createdAt.toISOString(),
      isOpen: customerServiceLogOpen(row.log.status),
      vehicleId: row.log.vehicleId,
      vehicleLabel: veh,
      invoiceId: row.log.invoiceId,
      invoiceNumberFormatted: null,
    })
  }

  for (const row of legacyServiceRows) {
    const veh = vehicleLabelFromRow(row.vehicle)
    items.push({
      id: row.request.id,
      kind: 'service',
      title: `${veh} — ${row.request.serviceCategory}`,
      meta: `${formatRequestDate(row.request.createdAt)} · ${row.request.urgency}`,
      status: row.request.status,
      statusLabel: requestStatusLabel(row.request.status),
      createdAt: row.request.createdAt.toISOString(),
      isOpen: row.request.status === 'pending',
      vehicleId: row.request.vehicleId,
      vehicleLabel: veh,
      invoiceId: null,
      invoiceNumberFormatted: null,
    })
  }

  for (const row of billingRows) {
    const invLabel = row.invoiceNumber != null
      ? formatInvoiceNumber(row.invoiceNumber)
      : 'General billing'
    const veh = vehicleLabelFromRow(row.vehicle?.busNumber || row.vehicle?.unitTag ? row.vehicle : null)
    items.push({
      id: row.request.id,
      kind: 'billing',
      title: `${invLabel} — ${row.request.topic}`,
      meta: formatRequestDate(row.request.createdAt),
      status: row.request.status,
      statusLabel: requestStatusLabel(row.request.status),
      createdAt: row.request.createdAt.toISOString(),
      isOpen: row.request.status === 'pending',
      vehicleId: row.invoiceVehicleId ?? null,
      vehicleLabel: veh || null,
      invoiceId: row.request.invoiceId ?? null,
      invoiceNumberFormatted: row.invoiceNumber != null ? formatInvoiceNumber(row.invoiceNumber) : null,
    })
  }

  for (const row of vehicleRows) {
    const veh = vehicleLabelFromRow(row.vehicle)
    items.push({
      id: row.request.id,
      kind: 'vehicle_change',
      title: `${veh} — ${row.request.subject}`,
      meta: formatRequestDate(row.request.createdAt),
      status: row.request.status,
      statusLabel: requestStatusLabel(row.request.status),
      createdAt: row.request.createdAt.toISOString(),
      isOpen: row.request.status === 'pending',
      vehicleId: row.request.vehicleId,
      vehicleLabel: veh,
      invoiceId: null,
      invoiceNumberFormatted: null,
    })
  }

  for (const row of vehicleAddRows) {
    items.push({
      id: row.id,
      kind: 'vehicle_add',
      title: `${row.fleetTag} — new vehicle`,
      meta: formatRequestDate(row.createdAt),
      status: row.status,
      statusLabel: requestStatusLabel(row.status),
      createdAt: row.createdAt.toISOString(),
      isOpen: row.status === 'pending',
      vehicleId: null,
      vehicleLabel: row.fleetTag,
      invoiceId: null,
      invoiceNumberFormatted: null,
    })
  }

  for (const row of generalRows) {
    items.push({
      id: row.id,
      kind: 'general',
      title: row.subject,
      meta: formatRequestDate(row.createdAt),
      status: row.status,
      statusLabel: requestStatusLabel(row.status),
      createdAt: row.createdAt.toISOString(),
      isOpen: row.status === 'pending',
      vehicleId: null,
      vehicleLabel: null,
      invoiceId: null,
      invoiceNumberFormatted: null,
    })
  }

  return items
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
}

export async function getPortalRequestDetail(
  db: Db,
  customerId: string,
  kind: PortalRequestKind,
  id: string,
): Promise<PortalRequestDetailPayload> {
  await getPortalCustomer(db, customerId)

  if (kind === 'service') {
    const [logRow] = await db.select({
      log: serviceLogs,
      vehicle: {
        unitType: vehicles.unitType,
        busNumber: vehicles.busNumber,
        unitTag: vehicles.unitTag,
      },
    })
      .from(serviceLogs)
      .leftJoin(vehicles, eq(serviceLogs.vehicleId, vehicles.id))
      .where(and(
        eq(serviceLogs.id, id),
        eq(serviceLogs.customerId, customerId),
        eq(serviceLogs.customerRequested, true),
      ))
      .limit(1)

    if (logRow) {
      const veh = vehicleLabelFromRow(logRow.vehicle)
      return {
        id: logRow.log.id,
        kind: 'service',
        status: logRow.log.status,
        statusLabel: customerServiceLogStatusLabel(logRow.log.status),
        createdAt: logRow.log.createdAt.toISOString(),
        isOpen: customerServiceLogOpen(logRow.log.status),
        reviewedAt: null,
        reviewReason: logRow.log.statusReason,
        title: `${veh} — ${logRow.log.complaint?.trim().slice(0, 80) || workTypeLabelFromKey(logRow.log.workType)}`,
        vehicleId: logRow.log.vehicleId,
        vehicleLabel: veh,
        invoiceId: logRow.log.invoiceId,
        invoiceNumberFormatted: null,
        serviceCategory: workTypeLabelFromKey(logRow.log.workType),
        urgency: null,
        preferredDate: logRow.log.serviceDate,
        location: logRow.log.location,
        description: logRow.log.complaint,
      }
    }

    const [row] = await db.select({
      request: serviceRequests,
      vehicle: {
        unitType: vehicles.unitType,
        busNumber: vehicles.busNumber,
        unitTag: vehicles.unitTag,
      },
    })
      .from(serviceRequests)
      .innerJoin(vehicles, eq(serviceRequests.vehicleId, vehicles.id))
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.customerId, customerId)))
      .limit(1)
    if (!row) throw new PortalServiceError('NOT_FOUND')
    const veh = vehicleLabelFromRow(row.vehicle)
    return {
      id: row.request.id,
      kind: 'service',
      status: row.request.status,
      statusLabel: requestStatusLabel(row.request.status),
      createdAt: row.request.createdAt.toISOString(),
      isOpen: row.request.status === 'pending',
      reviewedAt: row.request.reviewedAt?.toISOString() ?? null,
      reviewReason: row.request.reviewReason,
      title: `${veh} — ${row.request.serviceCategory}`,
      vehicleId: row.request.vehicleId,
      vehicleLabel: veh,
      invoiceId: null,
      invoiceNumberFormatted: null,
      serviceCategory: row.request.serviceCategory,
      urgency: row.request.urgency,
      preferredDate: row.request.preferredDate,
      location: row.request.location,
      description: row.request.description,
    }
  }

  if (kind === 'billing') {
    const [row] = await db.select({
      request: invoiceChangeRequests,
      invoiceNumber: invoices.invoiceNumber,
      invoiceVehicleId: invoices.vehicleId,
      vehicle: {
        unitType: vehicles.unitType,
        busNumber: vehicles.busNumber,
        unitTag: vehicles.unitTag,
      },
    })
      .from(invoiceChangeRequests)
      .leftJoin(invoices, eq(invoiceChangeRequests.invoiceId, invoices.id))
      .leftJoin(vehicles, eq(invoices.vehicleId, vehicles.id))
      .where(and(eq(invoiceChangeRequests.id, id), eq(invoiceChangeRequests.customerId, customerId)))
      .limit(1)
    if (!row) throw new PortalServiceError('NOT_FOUND')
    const invLabel = row.invoiceNumber != null
      ? formatInvoiceNumber(row.invoiceNumber)
      : 'General billing'
    const veh = vehicleLabelFromRow(row.vehicle?.busNumber || row.vehicle?.unitTag ? row.vehicle : null)
    return {
      id: row.request.id,
      kind: 'billing',
      status: row.request.status,
      statusLabel: requestStatusLabel(row.request.status),
      createdAt: row.request.createdAt.toISOString(),
      isOpen: row.request.status === 'pending',
      reviewedAt: row.request.reviewedAt?.toISOString() ?? null,
      reviewReason: row.request.reviewReason,
      title: `${invLabel} — ${row.request.topic}`,
      vehicleId: row.invoiceVehicleId ?? null,
      vehicleLabel: veh || null,
      invoiceId: row.request.invoiceId ?? null,
      invoiceNumberFormatted: row.invoiceNumber != null ? formatInvoiceNumber(row.invoiceNumber) : null,
      topic: row.request.topic,
      description: row.request.description,
      correctionPayload: row.request.correctionPayload ?? null,
    }
  }

  if (kind === 'vehicle_change') {
    const [row] = await db.select({
      request: vehicleChangeRequests,
      vehicle: {
        unitType: vehicles.unitType,
        busNumber: vehicles.busNumber,
        unitTag: vehicles.unitTag,
      },
    })
      .from(vehicleChangeRequests)
      .innerJoin(vehicles, eq(vehicleChangeRequests.vehicleId, vehicles.id))
      .where(and(eq(vehicleChangeRequests.id, id), eq(vehicleChangeRequests.customerId, customerId)))
      .limit(1)
    if (!row) throw new PortalServiceError('NOT_FOUND')
    const veh = vehicleLabelFromRow(row.vehicle)
    return {
      id: row.request.id,
      kind: 'vehicle_change',
      status: row.request.status,
      statusLabel: requestStatusLabel(row.request.status),
      createdAt: row.request.createdAt.toISOString(),
      isOpen: row.request.status === 'pending',
      reviewedAt: row.request.reviewedAt?.toISOString() ?? null,
      reviewReason: row.request.reviewReason,
      title: `${veh} — ${row.request.subject}`,
      vehicleId: row.request.vehicleId,
      vehicleLabel: veh,
      invoiceId: null,
      invoiceNumberFormatted: null,
      subject: row.request.subject,
      description: row.request.description,
    }
  }

  if (kind === 'vehicle_add') {
    const [row] = await db.select()
      .from(newVehicleRequests)
      .where(and(eq(newVehicleRequests.id, id), eq(newVehicleRequests.customerId, customerId)))
      .limit(1)
    if (!row) throw new PortalServiceError('NOT_FOUND')
    return {
      id: row.id,
      kind: 'vehicle_add',
      status: row.status,
      statusLabel: requestStatusLabel(row.status),
      createdAt: row.createdAt.toISOString(),
      isOpen: row.status === 'pending',
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewReason: row.reviewReason,
      title: `${row.fleetTag} — new vehicle`,
      vehicleId: null,
      vehicleLabel: row.fleetTag,
      invoiceId: null,
      invoiceNumberFormatted: null,
      fleetTag: row.fleetTag,
      unitType: row.unitType,
      description: row.notes ?? undefined,
      subject: 'New vehicle request',
    }
  }

  if (kind === 'general') {
    const [row] = await db.select()
      .from(portalGeneralRequests)
      .where(and(eq(portalGeneralRequests.id, id), eq(portalGeneralRequests.customerId, customerId)))
      .limit(1)
    if (!row) throw new PortalServiceError('NOT_FOUND')
    return {
      id: row.id,
      kind: 'general',
      status: row.status,
      statusLabel: requestStatusLabel(row.status),
      createdAt: row.createdAt.toISOString(),
      isOpen: row.status === 'pending',
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewReason: row.reviewReason,
      title: row.subject,
      vehicleId: null,
      vehicleLabel: null,
      invoiceId: null,
      invoiceNumberFormatted: null,
      subject: row.subject,
      message: row.message,
    }
  }

  throw new PortalServiceError('NOT_FOUND')
}

function portalRequestTypeLabel(kind: PortalRequestHistoryItem['kind']): string {
  const labels: Record<PortalRequestHistoryItem['kind'], string> = {
    service: 'Service',
    billing: 'Billing',
    vehicle_change: 'Vehicle',
    vehicle_add: 'Vehicle',
    general: 'General',
  }
  return labels[kind]
}

async function getPortalOpenRequests(db: Db, customerId: string, limit = 5): Promise<PortalOpenRequest[]> {
  const items = await listPortalRequests(db, customerId, limit * 2)
  return items
    .filter(item => item.isOpen)
    .slice(0, limit)
    .map(item => ({
      id: item.id,
      type: portalRequestTypeLabel(item.kind),
      title: item.title,
      meta: item.meta,
      statusLabel: item.statusLabel,
    }))
}

function unitTypeLabel(key: string): string {
  const labels: Record<string, string> = {
    truck: 'Truck', bus: 'Bus', equipment: 'Equipment', tractor: 'Tractor', other: 'Unit',
  }
  return labels[key] ?? 'Unit'
}

function workTypeLabelFromKey(key: string): string {
  const labels: Record<string, string> = {
    preventive_maintenance: 'Preventive maintenance',
    repair: 'Repair / breakdown',
    diagnostic: 'Diagnostic',
    inspection: 'Inspection',
    other: 'Other',
  }
  return labels[key] ?? key
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

export async function getPortalCustomer(db: Db, customerId: string) {
  const [row] = await db.select().from(customers)
    .where(and(eq(customers.id, customerId), isNull(customers.archivedAt)))
  if (!row) throw new PortalServiceError('NOT_FOUND')
  if (!row.portalEnabled) throw new PortalServiceError('PORTAL_DISABLED')
  return row
}

export async function getPortalMe(
  db: Db,
  input: {
    userId: string
    userName: string
    userEmail: string
    username: string | null
    mustChangePassword: boolean
    customerId: string
  },
): Promise<PortalMePayload> {
  const company = await getPortalCustomer(db, input.customerId)
  const taxExemptionDocument = await getLatestEntityDocument(db, 'customer', input.customerId, 'tax_exemption_form')
  return {
    user: {
      id: input.userId,
      name: input.userName,
      email: input.userEmail,
      username: input.username,
      mustChangePassword: input.mustChangePassword,
    },
    company: {
      id: company.id,
      displayName: company.displayName,
      accountKind: company.accountKind,
      email: company.email,
      phone: company.phone,
      taxExempt: company.taxExempt,
    },
    taxExemptionDocument,
  }
}

export async function getPortalDashboard(db: Db, customerId: string, userName: string): Promise<PortalDashboardPayload> {
  const company = await getPortalCustomer(db, customerId)
  const yearStart = `${todayIsoDate().slice(0, 4)}-01-01`
  const baseInvoice = and(
    eq(invoices.customerId, customerId),
    isNull(invoices.archivedAt),
    or(...PORTAL_INVOICE_STATUSES.map(s => eq(invoices.status, s))),
  )

  const [vehicleCountRow] = await db.select({ value: count() })
    .from(vehicles)
    .where(and(eq(vehicles.customerId, customerId), isNull(vehicles.archivedAt)))

  const outstandingWhere = and(
    baseInvoice,
    eq(invoices.status, 'sent'),
    gt(invoices.balanceDue, '0'),
  )
  const [outstanding] = await db.select({
    count: count(),
    total: sum(invoices.balanceDue),
  }).from(invoices).where(outstandingWhere)

  const [paidYtd] = await db.select({ total: sum(invoices.amountPaid) })
    .from(invoices)
    .where(and(
      baseInvoice,
      eq(invoices.status, 'paid'),
      sql`${invoices.paidAt} >= ${yearStart}`,
    ))

  const recentRows = await db.select({
    invoice: invoices,
    vehicle: {
      unitType: vehicles.unitType,
      busNumber: vehicles.busNumber,
      unitTag: vehicles.unitTag,
    },
  })
    .from(invoices)
    .leftJoin(vehicles, eq(invoices.vehicleId, vehicles.id))
    .where(baseInvoice)
    .orderBy(desc(invoices.invoiceDate), desc(invoices.createdAt))
    .limit(5)

  const kindLabel = company.accountKind === 'fleet' ? 'fleet billing overview' : 'billing overview'
  const pendingRequestCount = await countPendingPortalRequests(db, customerId)
  const openRequests = await getPortalOpenRequests(db, customerId)

  return {
    greeting: greetingForHour(userName),
    subtext: `${company.displayName} · ${kindLabel}`,
    kpis: {
      openBalance: outstanding?.total ?? '0',
      openInvoiceCount: Number(outstanding?.count ?? 0),
      vehicleCount: Number(vehicleCountRow?.value ?? 0),
      paidYtdTotal: paidYtd?.total ?? '0',
      paidYtdLabel: paidYtdLabel(),
      pendingRequestCount,
    },
    recentInvoices: recentRows.map(r => ({
      id: r.invoice.id,
      invoiceNumberFormatted: formatInvoiceNumber(r.invoice.invoiceNumber),
      sublabel: invoiceSublabel(r.invoice.status, r.invoice.dueDate, r.invoice.paidAt),
      vehicleLabel: vehicleLabelFromRow(r.vehicle?.busNumber || r.vehicle?.unitTag ? r.vehicle : null),
      status: r.invoice.status,
      total: r.invoice.total,
      balanceDue: r.invoice.balanceDue,
    })),
    openRequests,
  }
}

export async function listPortalInvoices(db: Db, customerId: string, limit = 50) {
  await getPortalCustomer(db, customerId)

  const rows = await db.select({
    invoice: invoices,
    vehicle: {
      unitType: vehicles.unitType,
      busNumber: vehicles.busNumber,
      unitTag: vehicles.unitTag,
    },
  })
    .from(invoices)
    .leftJoin(vehicles, eq(invoices.vehicleId, vehicles.id))
    .where(and(
      eq(invoices.customerId, customerId),
      isNull(invoices.archivedAt),
      or(...PORTAL_INVOICE_STATUSES.map(s => eq(invoices.status, s))),
    ))
    .orderBy(desc(invoices.invoiceDate), desc(invoices.createdAt))
    .limit(limit)

  return rows.map(r => ({
    id: r.invoice.id,
    invoiceNumberFormatted: formatInvoiceNumber(r.invoice.invoiceNumber),
    status: r.invoice.status,
    invoiceDate: r.invoice.invoiceDate,
    dueDate: r.invoice.dueDate,
    total: r.invoice.total,
    balanceDue: r.invoice.balanceDue,
    vehicleId: r.invoice.vehicleId,
    vehicleLabel: vehicleLabelFromRow(r.vehicle?.busNumber || r.vehicle?.unitTag ? r.vehicle : null),
  }))
}

export async function getPortalInvoice(db: Db, customerId: string, invoiceId: string) {
  const detail = await getPortalInvoiceDetail(db, customerId, invoiceId)
  const { lineItems: _lines, vehicle: _vehicle, ...summary } = detail
  return summary
}

export async function getPortalInvoiceDetail(db: Db, customerId: string, invoiceId: string) {
  const [row] = await db.select({
    invoice: invoices,
    vehicle: {
      unitType: vehicles.unitType,
      busNumber: vehicles.busNumber,
      unitTag: vehicles.unitTag,
      year: vehicles.year,
      make: vehicles.make,
      model: vehicles.model,
      vin: vehicles.vin,
    },
  })
    .from(invoices)
    .leftJoin(vehicles, eq(invoices.vehicleId, vehicles.id))
    .where(and(eq(invoices.id, invoiceId), isNull(invoices.archivedAt)))
    .limit(1)

  if (!row) throw new PortalServiceError('NOT_FOUND')
  if (row.invoice.customerId !== customerId) throw new PortalServiceError('NOT_FOUND')
  if (!PORTAL_INVOICE_STATUSES.includes(row.invoice.status as typeof PORTAL_INVOICE_STATUSES[number])) {
    throw new PortalServiceError('NOT_FOUND')
  }

  const lines = await listInvoiceLineItems(db, invoiceId)

  const snapshot = row.invoice.vehicleSnapshot
  const vehicleRow = snapshot
    ? {
        unitType: snapshot.unitType,
        busNumber: snapshot.busNumber,
        unitTag: snapshot.unitTag,
        year: snapshot.year,
        make: snapshot.make,
        model: snapshot.model,
        vin: snapshot.vin ?? null,
        plate: snapshot.plate ?? null,
        odometer: snapshot.odometer ?? null,
        odometerUnit: snapshot.odometerUnit ?? 'mi',
      }
    : row.vehicle?.busNumber || row.vehicle?.unitTag || row.vehicle?.make
      ? {
          unitType: row.vehicle.unitType,
          busNumber: row.vehicle.busNumber,
          unitTag: row.vehicle.unitTag,
          year: row.vehicle.year,
          make: row.vehicle.make,
          model: row.vehicle.model,
          vin: row.vehicle.vin ?? null,
          plate: null,
          odometer: null,
          odometerUnit: 'mi',
        }
      : null

  return {
    id: row.invoice.id,
    invoiceNumberFormatted: formatInvoiceNumber(row.invoice.invoiceNumber),
    status: row.invoice.status,
    invoiceDate: row.invoice.invoiceDate,
    dueDate: row.invoice.dueDate,
    total: row.invoice.total,
    subtotal: row.invoice.subtotal,
    taxAmount: row.invoice.taxAmount,
    discountAmount: row.invoice.discountAmount,
    feesAmount: row.invoice.feesAmount,
    balanceDue: row.invoice.balanceDue,
    amountPaid: row.invoice.amountPaid,
    paymentTerms: row.invoice.paymentTerms,
    poNumber: row.invoice.poNumber,
    serviceLocation: row.invoice.serviceLocation,
    customerNotes: row.invoice.customerNotes,
    complaint: row.invoice.complaint,
    paidAt: row.invoice.paidAt,
    sentAt: row.invoice.sentAt,
    vehicleId: row.invoice.vehicleId,
    vehicleLabel: vehicleLabelFromRow(vehicleRow)
      ?? '—',
    vehicle: vehicleRow,
    lineItems: lines.map(line => ({
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineAmount: line.lineAmount,
      lineType: line.lineType,
    })),
  }
}

export async function getPortalInvoicePdfDownload(db: Db, customerId: string, invoiceId: string) {
  await getPortalInvoice(db, customerId, invoiceId)
  try {
    return await getInvoicePdfDownload(db, invoiceId)
  }
  catch (err) {
    if (err instanceof InvoicePdfServiceError && err.code === 'NO_PDF') {
      throw new PortalServiceError('NO_PDF')
    }
    throw err
  }
}

export interface PortalVehicleRow {
  id: string
  tagLabel: string
  unitTypeLabel: string
  unitDescription: string
  vin: string | null
  lastServiceDate: string | null
  registrationDocument: PortalDocumentMeta | null
}

export async function listPortalVehicles(db: Db, customerId: string): Promise<PortalVehicleRow[]> {
  await getPortalCustomer(db, customerId)

  const rows = await db.select({
    vehicle: vehicles,
    lastServiceDate: max(serviceLogs.serviceDate),
  })
    .from(vehicles)
    .leftJoin(serviceLogs, and(
      eq(serviceLogs.vehicleId, vehicles.id),
      isNull(serviceLogs.archivedAt),
    ))
    .where(and(eq(vehicles.customerId, customerId), isNull(vehicles.archivedAt)))
    .groupBy(vehicles.id)
    .orderBy(vehicles.busNumber, vehicles.unitTag, vehicles.createdAt)

  return Promise.all(rows.map(async (r) => {
    const registrationDocument = await getLatestEntityDocument(db, 'vehicle', r.vehicle.id, 'vehicle_registration')
    return {
      id: r.vehicle.id,
      tagLabel: vehicleLabelFromRow(r.vehicle),
      unitTypeLabel: unitTypeLabel(r.vehicle.unitType),
      unitDescription: [r.vehicle.year, r.vehicle.make, r.vehicle.model].filter(Boolean).join(' ') || '—',
      vin: r.vehicle.vin,
      lastServiceDate: r.lastServiceDate ?? null,
      registrationDocument,
    }
  }))
}

export interface NewVehicleRequestInput {
  fleetTag: string
  unitType: 'truck' | 'bus' | 'equipment' | 'tractor' | 'other'
  vin?: string | null
  year?: number | null
  make?: string | null
  model?: string | null
  notes?: string | null
}

export async function createNewVehicleRequest(
  db: Db,
  customerId: string,
  submittedBy: string,
  input: NewVehicleRequestInput,
) {
  await getPortalCustomer(db, customerId)

  const [row] = await db.insert(newVehicleRequests).values({
    customerId,
    submittedBy,
    fleetTag: input.fleetTag.trim(),
    unitType: input.unitType,
    vin: input.vin?.trim().toUpperCase() || null,
    year: input.year ?? null,
    make: input.make?.trim() || null,
    model: input.model?.trim() || null,
    notes: input.notes?.trim() || null,
  }).returning()

  return row!
}

export interface ServiceRequestInput {
  vehicleId: string
  serviceCategory: string
  urgency: 'normal' | 'soon' | 'urgent'
  preferredDate?: string | null
  location?: string | null
  description: string
}

export async function createServiceRequest(
  db: Db,
  customerId: string,
  submittedBy: string,
  input: ServiceRequestInput,
) {
  await getPortalCustomer(db, customerId)
  await assertPortalVehicle(db, customerId, input.vehicleId)

  const preferred = input.preferredDate?.trim()
  const serviceDate = preferred && /^\d{4}-\d{2}-\d{2}$/.test(preferred)
    ? preferred
    : todayIsoDate()

  const internalNotes = [
    'Portal service request',
    `Category: ${input.serviceCategory.trim()}`,
    `Urgency: ${input.urgency}`,
    preferred ? `Preferred date: ${preferred}` : null,
  ].filter(Boolean).join('\n')

  return createServiceLog(db, {
    customerId,
    vehicleId: input.vehicleId,
    serviceDate,
    location: input.location?.trim() || null,
    workType: mapPortalCategoryToWorkType(input.serviceCategory),
    complaint: input.description.trim(),
    internalNotes,
    customerRequested: true,
  }, submittedBy)
}

function vehicleSnapshotToCorrectionFields(snapshot: InvoiceVehicleSnapshot): PortalVehicleCorrectionFields {
  return {
    busNumber: snapshot.busNumber,
    unitTag: snapshot.unitTag,
    year: snapshot.year,
    make: snapshot.make,
    model: snapshot.model,
    vin: snapshot.vin,
    plate: snapshot.plate,
    odometer: snapshot.odometer,
    odometerUnit: snapshot.odometerUnit ?? 'mi',
  }
}

async function resolveInvoiceVehicleSnapshotForCorrection(
  db: Db,
  invoiceId: string,
): Promise<InvoiceVehicleSnapshot> {
  const invoice = await getInvoice(db, invoiceId)
  if (invoice.vehicleSnapshot) return invoice.vehicleSnapshot
  if (invoice.vehicleId) {
    const vehicle = await getVehicle(db, invoice.vehicleId)
    return buildVehicleSnapshot(vehicle)
  }
  throw new PortalServiceError('NO_VEHICLE')
}

function proposedVehicleCorrectionFields(
  original: PortalVehicleCorrectionFields,
  input: PortalVehicleCorrectionInput,
): PortalVehicleCorrectionFields {
  const unitNumber = input.unitNumber?.trim().replace(/^#/, '') || null
  const usesBusNumber = Boolean(original.busNumber) || (!original.unitTag && Boolean(unitNumber))
  return {
    busNumber: usesBusNumber ? unitNumber : null,
    unitTag: usesBusNumber ? null : unitNumber,
    year: input.year ?? original.year,
    make: input.make?.trim() || null,
    model: input.model?.trim() || null,
    vin: input.vin?.trim().toUpperCase() || null,
    plate: input.plate?.trim() || null,
    odometer: input.odometer?.trim() || null,
    odometerUnit: input.odometerUnit ?? original.odometerUnit ?? 'mi',
  }
}

export async function createInvoiceChangeRequest(
  db: Db,
  customerId: string,
  submittedBy: string,
  input: PortalInvoiceChangeRequestInput,
) {
  await getPortalCustomer(db, customerId)

  let description = input.description?.trim() ?? ''
  let correctionPayload: PortalInvoiceCorrectionPayload | null = null

  if (input.lineItemCorrection || input.vehicleCorrection) {
    if (!input.invoiceId) throw new PortalServiceError('INVALID_INVOICE')
    await assertPortalInvoiceForChangeRequest(db, customerId, input.invoiceId)
  }
  else {
    await assertPortalInvoiceOptional(db, customerId, input.invoiceId)
  }

  const [invoiceRow] = input.invoiceId
    ? await db.select({ invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(eq(invoices.id, input.invoiceId))
      .limit(1)
    : []

  if (input.lineItemCorrection) {
    const lines = await listInvoiceLineItems(db, input.invoiceId!)
    const sourceLine = lines.find(line => line.id === input.lineItemCorrection!.lineItemId)
    if (!sourceLine) throw new PortalServiceError('INVALID_LINE_ITEM')

    correctionPayload = {
      kind: 'line_item',
      lineItemId: input.lineItemCorrection.lineItemId,
      original: {
        description: sourceLine.description,
        quantity: sourceLine.quantity,
        unitPrice: sourceLine.unitPrice,
      },
      proposed: {
        description: input.lineItemCorrection.description.trim(),
        quantity: input.lineItemCorrection.quantity,
        unitPrice: input.lineItemCorrection.unitPrice,
      },
      notes: input.lineItemCorrection.notes?.trim() || null,
    }

    description = buildPortalLineItemCorrectionDescription(
      formatInvoiceNumber(invoiceRow!.invoiceNumber),
      correctionPayload,
    )
  }
  else if (input.vehicleCorrection) {
    const snapshot = await resolveInvoiceVehicleSnapshotForCorrection(db, input.invoiceId!)
    const original = vehicleSnapshotToCorrectionFields(snapshot)
    const proposed = proposedVehicleCorrectionFields(original, input.vehicleCorrection)

    correctionPayload = {
      kind: 'vehicle',
      original,
      proposed,
      notes: input.vehicleCorrection.notes?.trim() || null,
    }

    description = buildPortalVehicleCorrectionDescription(
      formatInvoiceNumber(invoiceRow!.invoiceNumber),
      correctionPayload,
    )
  }

  if (!description) throw new PortalServiceError('INVALID_CORRECTION')

  const [row] = await db.insert(invoiceChangeRequests).values({
    customerId,
    submittedBy,
    invoiceId: input.invoiceId ?? null,
    topic: input.topic.trim(),
    description,
    correctionPayload,
  }).returning()

  return row!
}

export interface VehicleChangeRequestInput {
  vehicleId: string
  subject: string
  description: string
}

export async function createVehicleChangeRequest(
  db: Db,
  customerId: string,
  submittedBy: string,
  input: VehicleChangeRequestInput,
) {
  await getPortalCustomer(db, customerId)
  await assertPortalVehicle(db, customerId, input.vehicleId)

  const [row] = await db.insert(vehicleChangeRequests).values({
    customerId,
    submittedBy,
    vehicleId: input.vehicleId,
    subject: input.subject.trim(),
    description: input.description.trim(),
  }).returning()

  return row!
}

export interface GeneralRequestInput {
  subject: string
  message: string
}

export async function createGeneralRequest(
  db: Db,
  customerId: string,
  submittedBy: string,
  input: GeneralRequestInput,
) {
  await getPortalCustomer(db, customerId)

  const [row] = await db.insert(portalGeneralRequests).values({
    customerId,
    submittedBy,
    subject: input.subject.trim(),
    message: input.message.trim(),
  }).returning()

  return row!
}

/** Staff-side helper to provision a portal login (used in tests; full flow in P2-01). */
export async function createPortalUser(
  db: Db,
  input: {
    customerId: string
    name: string
    email: string
    passwordHash: string
    username?: string
    mustChangePassword?: boolean
    tempPasswordExpiresAt?: Date | null
  },
) {
  const { accountTypes, users } = await import('../db/schema/auth')
  const { allocateUniquePortalUsername } = await import('../../shared/format/portal-username')
  const [typeRow] = await db.select().from(accountTypes).where(eq(accountTypes.key, 'customer'))
  if (!typeRow) throw new Error('customer account type missing — run db:seed')

  const [customer] = await db.select().from(customers).where(eq(customers.id, input.customerId))
  if (!customer) throw new PortalServiceError('NOT_FOUND')

  await db.update(customers)
    .set({ portalEnabled: true, updatedAt: new Date() })
    .where(eq(customers.id, input.customerId))

  const username = input.username
    ?? await allocateUniquePortalUsername(
      customer.displayName,
      async (candidate) => {
        const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, candidate)).limit(1)
        return !!taken
      },
    )

  const [user] = await db.insert(users).values({
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    username,
    passwordHash: input.passwordHash,
    accountTypeId: typeRow.id,
    customerId: input.customerId,
    emailVerifiedAt: new Date(),
    approvedAt: new Date(),
    mustChangePassword: input.mustChangePassword ?? false,
    tempPasswordExpiresAt: input.tempPasswordExpiresAt ?? null,
  }).returning()

  return user!
}
