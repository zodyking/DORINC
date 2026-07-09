// Integration tests for invoices schema + API (P1-20/P1-21): draft create,
// line items with catalog snapshots, server-side totals, status transitions,
// creation paths, finalized immutability, duplicate + revision.
import { config } from 'dotenv'
import { eq, inArray, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { createCatalogItem, createCategory } from '../../server/services/catalog.service'
import { createCustomer } from '../../server/services/customers.service'
import {
  addInvoiceLineItem,
  approveInvoice,
  createInvoice,
  createInvoiceRevision,
  deleteInvoiceLineItem,
  duplicateInvoice,
  getInvoiceDetail,
  listInvoiceLineItems,
  markInvoicePaid,
  recalculateInvoiceTotals,
  sendInvoice,
  transitionInvoice,
  updateInvoiceDraft,
  updateInvoiceLineItem,
} from '../../server/services/invoices.service'
import { createServiceLog as createLog } from '../../server/services/service-logs.service'
import { createVehicle } from '../../server/services/vehicles.service'
import { formatInvoiceNumber, invoiceLineItems, invoices } from '../../server/db/schema/invoices'
import { customers } from '../../server/db/schema/customers'
import { vehicles } from '../../server/db/schema/vehicles'
import { serviceLogs } from '../../server/db/schema/service-logs'
import { users } from '../../server/db/schema/auth'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const ACTOR = anyUser!.id

const customer = await createCustomer(db, {
  displayName: `InvTest-${stamp} Hollis Logistics`,
  accountKind: 'fleet',
  taxExempt: true,
  paymentTerms: 'net_30',
}, ACTOR)

const vehicle = await createVehicle(db, {
  customerId: customer.id,
  unitType: 'truck',
  busNumber: `HL-${stamp}`,
  make: 'Freightliner',
  model: 'Cascadia',
  year: 2019,
  vin: `3AKJHHDR9KSJV${stamp}`,
}, ACTOR)

const category = await createCategory(db, { name: `InvCat-${stamp}`, sortOrder: 1 })

const catalogPart = await createCatalogItem(db, {
  itemType: 'part',
  sku: `NOX-${stamp}`,
  name: `InvTest-${stamp} NOx sensor`,
  categoryId: category.id,
  defaultPrice: '412.68',
  taxable: true,
  uom: 'each',
}, ACTOR)

const serviceLog = await createLog(db, {
  customerId: customer.id,
  vehicleId: vehicle.id,
  serviceDate: '2026-07-01',
  complaint: 'DPF fault code active',
  internalNotes: 'Needs regen cycle',
  location: 'Bay 3',
}, ACTOR)

afterAll(async () => {
  const invoiceRows = await db.select({ id: invoices.id }).from(invoices)
    .where(eq(invoices.customerId, customer.id))
  const invoiceIds = invoiceRows.map(r => r.id)
  if (invoiceIds.length) {
    await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, invoiceIds))
    await db.delete(invoices).where(inArray(invoices.id, invoiceIds))
  }
  await db.delete(serviceLogs).where(eq(serviceLogs.customerId, customer.id))
  await db.delete(vehicles).where(eq(vehicles.customerId, customer.id))
  await db.delete(customers).where(like(customers.displayName, `InvTest-${stamp}%`))
  await pool.end()
})

async function draftWithLine() {
  const invoice = await createInvoice(db, {
    customerId: customer.id,
    vehicleId: vehicle.id,
    invoiceDate: '2026-07-07',
    shopSuppliesPercent: '3.5',
    creationSource: 'blank',
  }, ACTOR)

  await addInvoiceLineItem(db, invoice.id, {
    lineType: 'labor',
    description: 'Diesel diagnostic',
    quantity: '2',
    unitPrice: '145.00',
    sortOrder: 1,
  }, ACTOR)

  return invoice
}

describe('P1-20 invoices schema', () => {
  it('creates a draft with formatted invoice number and snapshots', async () => {
    const invoice = await createInvoice(db, {
      customerId: customer.id,
      vehicleId: vehicle.id,
      creationSource: 'customer',
      invoiceDate: '2026-07-03',
      dueDate: '2026-08-02',
      complaint: 'Check engine light on',
    }, ACTOR)

    expect(invoice.status).toBe('draft')
    expect(invoice.invoiceNumber).toBeGreaterThan(0)
    expect(formatInvoiceNumber(invoice.invoiceNumber)).toMatch(/^INV-\d{6}$/)
    expect(invoice.customerSnapshot.displayName).toBe(customer.displayName)
    expect(invoice.vehicleSnapshot?.busNumber).toBe(vehicle.busNumber)
    expect(invoice.taxExempt).toBe(true)
  })

  it('stores catalog_snapshot when adding a line from catalog', async () => {
    const invoice = await createInvoice(db, {
      customerId: customer.id,
      vehicleId: vehicle.id,
      invoiceDate: '2026-07-07',
      shopSuppliesPercent: '3.5',
      creationSource: 'blank',
    }, ACTOR)

    await addInvoiceLineItem(db, invoice.id, {
      lineType: 'labor',
      description: 'Diesel diagnostic — DPF regeneration fault',
      quantity: '2',
      unitPrice: '145.00',
      taxable: true,
      sortOrder: 1,
    }, ACTOR)

    const partLine = await addInvoiceLineItem(db, invoice.id, {
      lineType: 'part',
      catalogItemId: catalogPart.id,
      description: 'NOx sensor, outlet (OEM 2894940)',
      quantity: '1',
      unitPrice: '412.68',
      sortOrder: 2,
    }, ACTOR)

    expect(partLine.catalogSnapshot).toBeTruthy()
    expect(partLine.catalogSnapshot?.catalogItemId).toBe(catalogPart.id)
    expect(partLine.catalogSnapshot?.sku).toBe(catalogPart.sku)
    expect(partLine.catalogSnapshot?.name).toContain('NOx sensor')
    expect(partLine.catalogSnapshot?.capturedAt).toBeTruthy()

    await addInvoiceLineItem(db, invoice.id, {
      lineType: 'labor',
      description: 'NOx sensor replacement + ECM relearn',
      quantity: '1.5',
      unitPrice: '145.00',
      sortOrder: 3,
    }, ACTOR)

    const lines = await listInvoiceLineItems(db, invoice.id)
    expect(lines).toHaveLength(3)

    const { invoice: updated, totals } = await recalculateInvoiceTotals(db, invoice.id, ACTOR)
    expect(totals.subtotal).toBe('920.18')
    expect(totals.feesAmount).toBe('32.21')
    expect(totals.total).toBe('952.39')
    expect(updated.subtotal).toBe('920.18')
    expect(updated.total).toBe('952.39')
    expect(updated.balanceDue).toBe('952.39')
  })
})

describe('P1-21 creation paths', () => {
  it('creates from vehicle path (derives customer)', async () => {
    const invoice = await createInvoice(db, {
      creationSource: 'vehicle',
      vehicleId: vehicle.id,
      invoiceDate: '2026-07-08',
    }, ACTOR)
    expect(invoice.customerId).toBe(customer.id)
    expect(invoice.vehicleId).toBe(vehicle.id)
    expect(invoice.creationSource).toBe('vehicle')
  })

  it('creates from service log with prefilled fields', async () => {
    const invoice = await createInvoice(db, {
      creationSource: 'service_log',
      serviceLogId: serviceLog.id,
      invoiceDate: '2026-07-08',
    }, ACTOR)
    expect(invoice.serviceLogId).toBe(serviceLog.id)
    expect(invoice.complaint).toBe('DPF fault code active')
    expect(invoice.internalNotes).toBe('Needs regen cycle')
    expect(invoice.serviceLocation).toBe('Bay 3')
  })

  it('duplicates an invoice with line items', async () => {
    const source = await draftWithLine()
    const copy = await duplicateInvoice(db, source.id, ACTOR)
    expect(copy.creationSource).toBe('duplicate')
    expect(copy.sourceInvoiceId).toBe(source.id)
    expect(copy.status).toBe('draft')
    const lines = await listInvoiceLineItems(db, copy.id)
    expect(lines).toHaveLength(1)
    expect(lines[0].description).toBe('Diesel diagnostic')
  })
})

describe('P1-21 draft editing + line item CRUD', () => {
  it('updates draft header fields', async () => {
    const invoice = await draftWithLine()
    const { invoice: updated, changedFields } = await updateInvoiceDraft(db, invoice.id, {
      poNumber: 'PO-4421',
      customerNotes: 'Please remit to AP',
    }, ACTOR)
    expect(changedFields).toEqual(['poNumber', 'customerNotes'])
    expect(updated.poNumber).toBe('PO-4421')
  })

  it('updates and deletes line items with auto totals', async () => {
    const invoice = await draftWithLine()
    const lines = await listInvoiceLineItems(db, invoice.id)
    const { line } = await updateInvoiceLineItem(db, invoice.id, lines[0].id, {
      quantity: '3',
    }, ACTOR)
    expect(line.quantity).toBe('3.00')
    expect(line.lineAmount).toBe('435.00')

    await deleteInvoiceLineItem(db, invoice.id, lines[0].id, ACTOR)
    const remaining = await listInvoiceLineItems(db, invoice.id)
    expect(remaining).toHaveLength(0)
  })

  it('rejects edits on finalized invoices', async () => {
    const invoice = await draftWithLine()
    await approveInvoice(db, invoice.id, ACTOR)
    await expect(updateInvoiceDraft(db, invoice.id, { poNumber: 'X' }, ACTOR))
      .rejects.toThrow('NOT_EDITABLE')
    const lines = await listInvoiceLineItems(db, invoice.id)
    await expect(addInvoiceLineItem(db, invoice.id, {
      lineType: 'fee',
      description: 'Late fee',
      quantity: '1',
      unitPrice: '25.00',
    }, ACTOR)).rejects.toThrow('NOT_EDITABLE')
    await expect(updateInvoiceLineItem(db, invoice.id, lines[0].id, { quantity: '5' }, ACTOR))
      .rejects.toThrow('NOT_EDITABLE')
    await expect(deleteInvoiceLineItem(db, invoice.id, lines[0].id, ACTOR))
      .rejects.toThrow('NOT_EDITABLE')
  })
})

describe('P1-21 status transitions (SPEC §6.5)', () => {
  it('walks draft → approved → sent → paid', async () => {
    const invoice = await draftWithLine()
    const { invoice: approved } = await approveInvoice(db, invoice.id, ACTOR)
    expect(approved.status).toBe('approved')
    expect(approved.approvedAt).not.toBeNull()

    const { invoice: sent } = await sendInvoice(db, invoice.id, ACTOR)
    expect(sent.status).toBe('sent')
    expect(sent.sentAt).not.toBeNull()

    const { invoice: paid } = await markInvoicePaid(db, invoice.id, ACTOR)
    expect(paid.status).toBe('paid')
    expect(paid.paidAt).not.toBeNull()
    expect(paid.balanceDue).toBe('0.00')
  })

  it('rejects invalid transitions', async () => {
    const invoice = await draftWithLine()
    await expect(transitionInvoice(db, invoice.id, 'sent', ACTOR))
      .rejects.toThrow('INVALID_TRANSITION')
    await expect(transitionInvoice(db, invoice.id, 'paid', ACTOR))
      .rejects.toThrow('INVALID_TRANSITION')

    await approveInvoice(db, invoice.id, ACTOR)
    await sendInvoice(db, invoice.id, ACTOR)
    await markInvoicePaid(db, invoice.id, ACTOR)
    await expect(transitionInvoice(db, invoice.id, 'draft', ACTOR))
      .rejects.toThrow('INVALID_TRANSITION')
  })

  it('creates a revision from a paid invoice (original stays immutable)', async () => {
    const invoice = await draftWithLine()
    await approveInvoice(db, invoice.id, ACTOR)
    await sendInvoice(db, invoice.id, ACTOR)
    await markInvoicePaid(db, invoice.id, ACTOR)

    const revision = await createInvoiceRevision(db, invoice.id, ACTOR)
    expect(revision.creationSource).toBe('revision')
    expect(revision.sourceInvoiceId).toBe(invoice.id)
    expect(revision.status).toBe('draft')

    const original = await getInvoiceDetail(db, invoice.id)
    expect(original.status).toBe('paid')
    const revLines = await listInvoiceLineItems(db, revision.id)
    expect(revLines).toHaveLength(1)
  })

  it('rejects revision from draft', async () => {
    const invoice = await draftWithLine()
    await expect(createInvoiceRevision(db, invoice.id, ACTOR))
      .rejects.toThrow('INVALID_TRANSITION')
  })

  it('records partial payment and keeps sent status until fully paid (P1-25)', async () => {
    const invoice = await draftWithLine()
    await approveInvoice(db, invoice.id, ACTOR)
    await sendInvoice(db, invoice.id, ACTOR)

    const sent = await getInvoiceDetail(db, invoice.id)
    const partial = '100.00'
    const { invoice: afterPartial } = await markInvoicePaid(db, invoice.id, ACTOR, { paymentAmount: partial })
    expect(afterPartial.status).toBe('sent')
    expect(afterPartial.amountPaid).toBe(partial)
    expect(Number.parseFloat(afterPartial.balanceDue)).toBeGreaterThan(0)

    const { invoice: paid } = await markInvoicePaid(db, invoice.id, ACTOR, {
      paymentAmount: afterPartial.balanceDue,
    })
    expect(paid.status).toBe('paid')
    expect(paid.balanceDue).toBe('0.00')
    expect(Number.parseFloat(paid.amountPaid)).toBeGreaterThan(Number.parseFloat(sent.total) - 0.01)
  })

  it('rejects overpayment (P1-25)', async () => {
    const invoice = await draftWithLine()
    await approveInvoice(db, invoice.id, ACTOR)
    await sendInvoice(db, invoice.id, ACTOR)
    const sent = await getInvoiceDetail(db, invoice.id)

    await expect(markInvoicePaid(db, invoice.id, ACTOR, {
      paymentAmount: (Number.parseFloat(sent.balanceDue) + 1).toFixed(2),
    })).rejects.toThrow('OVERPAYMENT')
  })
})
