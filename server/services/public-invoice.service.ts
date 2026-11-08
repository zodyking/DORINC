import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import { customers } from '../db/schema/customers'
import { formatInvoiceNumber, invoices } from '../db/schema/invoices'
import type {
  PortalInvoiceChangeRequestInput,
  PortalServiceRequestInput,
} from '../../shared/validators/portal'
import { parsePublicInvoiceSlug } from '../../shared/public-invoice'
import {
  createInvoiceChangeRequest,
  createServiceRequest,
  getPortalInvoiceDetail,
  getPortalInvoicePdfDownload,
  PortalServiceError,
} from './portal.service'
import { getInvoicePdfRecord } from './invoice-pdf.service'
import { getPublicBusinessProfile } from './workspace-settings.service'

const PUBLIC_INVOICE_STATUSES = ['sent', 'paid'] as const

export class PublicInvoiceServiceError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'NO_PDF' | 'NO_VEHICLE' | 'INVALID_CORRECTION') {
    super(code)
  }
}

export function requirePublicInvoiceNumber(raw: string): number {
  const n = parsePublicInvoiceSlug(raw)
  if (!n) throw new PublicInvoiceServiceError('NOT_FOUND')
  return n
}

async function loadPublicInvoiceRow(db: Db, invoiceNumber: number) {
  const [row] = await db.select({
    id: invoices.id,
    customerId: invoices.customerId,
    status: invoices.status,
    customerSnapshot: invoices.customerSnapshot,
  })
    .from(invoices)
    .where(and(eq(invoices.invoiceNumber, invoiceNumber), isNull(invoices.archivedAt)))
    .limit(1)

  if (!row?.customerId) throw new PublicInvoiceServiceError('NOT_FOUND')
  if (!PUBLIC_INVOICE_STATUSES.includes(row.status as typeof PUBLIC_INVOICE_STATUSES[number])) {
    throw new PublicInvoiceServiceError('NOT_FOUND')
  }

  const [customer] = await db.select({
    id: customers.id,
    displayName: customers.displayName,
    archivedAt: customers.archivedAt,
  })
    .from(customers)
    .where(eq(customers.id, row.customerId))
    .limit(1)

  if (!customer || customer.archivedAt) throw new PublicInvoiceServiceError('NOT_FOUND')

  return { ...row, customerId: row.customerId, customer }
}

export async function getPublicInvoicePage(db: Db, invoiceNumber: number) {
  const row = await loadPublicInvoiceRow(db, invoiceNumber)
  const [detail, pdfRecord, business] = await Promise.all([
    getPortalInvoiceDetail(db, row.customerId, row.id),
    getInvoicePdfRecord(db, row.id),
    getPublicBusinessProfile(db),
  ])

  return {
    ...detail,
    customerName: row.customerSnapshot?.displayName || row.customer.displayName,
    customerEmail: row.customerSnapshot?.email ?? null,
    hasPdf: Boolean(pdfRecord),
    company: {
      businessName: business.businessName,
      email: business.email,
      phone: business.phone,
    },
  }
}

export async function getPublicInvoicePdfDownload(db: Db, invoiceNumber: number) {
  const row = await loadPublicInvoiceRow(db, invoiceNumber)
  try {
    return await getPortalInvoicePdfDownload(db, row.customerId, row.id)
  }
  catch (err) {
    if (err instanceof PortalServiceError && err.code === 'NO_PDF') {
      throw new PublicInvoiceServiceError('NO_PDF')
    }
    if (err instanceof PortalServiceError && err.code === 'NOT_FOUND') {
      throw new PublicInvoiceServiceError('NOT_FOUND')
    }
    throw err
  }
}

export async function createPublicInvoiceChangeRequest(
  db: Db,
  invoiceNumber: number,
  input: Omit<PortalInvoiceChangeRequestInput, 'invoiceId'> & { invoiceId?: string },
) {
  const row = await loadPublicInvoiceRow(db, invoiceNumber)
  try {
    return await createInvoiceChangeRequest(
      db,
      row.customerId,
      null,
      {
        ...input,
        invoiceId: row.id,
      },
      { requirePortal: false },
    )
  }
  catch (err) {
    if (err instanceof PortalServiceError) {
      if (err.code === 'NO_VEHICLE') throw new PublicInvoiceServiceError('NO_VEHICLE')
      if (err.code === 'INVALID_CORRECTION' || err.code === 'INVALID_LINE_ITEM' || err.code === 'INVALID_INVOICE') {
        throw new PublicInvoiceServiceError('INVALID_CORRECTION')
      }
      throw new PublicInvoiceServiceError('NOT_FOUND')
    }
    throw err
  }
}

export async function createPublicInvoiceServiceRequest(
  db: Db,
  invoiceNumber: number,
  input: Omit<PortalServiceRequestInput, 'vehicleId'> & { vehicleId?: string },
) {
  const row = await loadPublicInvoiceRow(db, invoiceNumber)
  const detail = await getPortalInvoiceDetail(db, row.customerId, row.id)
  const vehicleId = input.vehicleId || detail.vehicleId
  if (!vehicleId) throw new PublicInvoiceServiceError('NO_VEHICLE')

  try {
    return await createServiceRequest(
      db,
      row.customerId,
      null,
      { ...input, vehicleId },
      { requirePortal: false },
    )
  }
  catch (err) {
    if (err instanceof PortalServiceError) {
      if (err.code === 'INVALID_VEHICLE') throw new PublicInvoiceServiceError('NO_VEHICLE')
      throw new PublicInvoiceServiceError('NOT_FOUND')
    }
    throw err
  }
}

export function publicInvoiceAuditLabel(invoiceNumber: number) {
  return formatInvoiceNumber(invoiceNumber)
}
