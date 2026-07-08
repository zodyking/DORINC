import { asc, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { CatalogSnapshot, InvoiceCreationSource, InvoiceCustomerSnapshot, InvoiceVehicleSnapshot } from '../db/schema/invoices'
import { invoiceLineItems, invoices } from '../db/schema/invoices'
import { getCatalogItem } from './catalog.service'
import { getCustomer } from './customers.service'
import { calculateInvoiceTotals, lineAmount } from './invoice-totals.service'
import { getVehicle } from './vehicles.service'

export type InvoicesServiceErrorCode
  = 'NOT_FOUND' | 'CUSTOMER_NOT_FOUND' | 'VEHICLE_NOT_FOUND' | 'CATALOG_NOT_FOUND'

export class InvoicesServiceError extends Error {
  constructor(public readonly code: InvoicesServiceErrorCode) {
    super(code)
  }
}

export interface CreateInvoiceInput {
  customerId: string
  vehicleId?: string | null
  serviceLogId?: string | null
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

export interface AddInvoiceLineInput {
  lineType: 'part' | 'service' | 'fee' | 'labor'
  catalogItemId?: string | null
  description: string
  quantity: string
  unitPrice: string
  taxable?: boolean
  sortOrder?: number
  priceOverridden?: boolean
  priceOverrideReason?: string | null
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
    odometer: vehicle.odometer,
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

export async function createInvoiceDraft(db: Db, input: CreateInvoiceInput, actorId: string) {
  let customer
  try {
    customer = await getCustomer(db, input.customerId)
  }
  catch {
    throw new InvoicesServiceError('CUSTOMER_NOT_FOUND')
  }

  let vehicleSnapshot: InvoiceVehicleSnapshot | null = null
  if (input.vehicleId) {
    try {
      const vehicle = await getVehicle(db, input.vehicleId)
      if (vehicle.customerId !== input.customerId) throw new InvoicesServiceError('VEHICLE_NOT_FOUND')
      vehicleSnapshot = buildVehicleSnapshot(vehicle)
    }
    catch (err) {
      if (err instanceof InvoicesServiceError) throw err
      throw new InvoicesServiceError('VEHICLE_NOT_FOUND')
    }
  }

  const [row] = await db.insert(invoices).values({
    customerId: input.customerId,
    vehicleId: input.vehicleId ?? null,
    serviceLogId: input.serviceLogId ?? null,
    creationSource: input.creationSource ?? 'blank',
    invoiceDate: input.invoiceDate,
    dueDate: input.dueDate ?? null,
    paymentTerms: input.paymentTerms ?? customer.paymentTerms,
    customerSnapshot: buildCustomerSnapshot(customer),
    vehicleSnapshot,
    serviceLocation: input.serviceLocation ?? null,
    poNumber: input.poNumber ?? null,
    complaint: input.complaint ?? null,
    internalNotes: input.internalNotes ?? null,
    customerNotes: input.customerNotes ?? null,
    taxExempt: customer.taxExempt,
    taxRate: input.taxRate ?? '0',
    shopSuppliesPercent: input.shopSuppliesPercent ?? null,
    feesAmount: input.feesAmount ?? '0',
    discountAmount: input.discountAmount ?? '0',
    createdBy: actorId,
    updatedBy: actorId,
  }).returning()

  return row!
}

export async function getInvoice(db: Db, id: string) {
  const [row] = await db.select().from(invoices).where(eq(invoices.id, id))
  if (!row) throw new InvoicesServiceError('NOT_FOUND')
  return row
}

export async function listInvoiceLineItems(db: Db, invoiceId: string) {
  return db.select().from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId))
    .orderBy(asc(invoiceLineItems.sortOrder), asc(invoiceLineItems.createdAt))
}

export async function addInvoiceLineItem(
  db: Db,
  invoiceId: string,
  input: AddInvoiceLineInput,
  actorId: string,
) {
  await getInvoice(db, invoiceId)

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
    lineType: input.lineType,
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

  return row!
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
    feesAmount: invoice.feesAmount ?? '0',
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
