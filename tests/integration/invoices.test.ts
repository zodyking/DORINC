// Integration tests for invoices schema + totals (P1-20): draft create,
// line items with catalog snapshots, server-side totals recalculation.
import { config } from 'dotenv'
import { eq, inArray, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { createCatalogItem, createCategory } from '../../server/services/catalog.service'
import { createCustomer } from '../../server/services/customers.service'
import {
  addInvoiceLineItem,
  createInvoiceDraft,
  listInvoiceLineItems,
  recalculateInvoiceTotals,
} from '../../server/services/invoices.service'
import { createVehicle } from '../../server/services/vehicles.service'
import { formatInvoiceNumber, invoiceLineItems, invoices } from '../../server/db/schema/invoices'
import { customers } from '../../server/db/schema/customers'
import { vehicles } from '../../server/db/schema/vehicles'
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

afterAll(async () => {
  const invoiceRows = await db.select({ id: invoices.id }).from(invoices)
    .where(eq(invoices.customerId, customer.id))
  const invoiceIds = invoiceRows.map(r => r.id)
  if (invoiceIds.length) {
    await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, invoiceIds))
    await db.delete(invoices).where(inArray(invoices.id, invoiceIds))
  }
  await db.delete(vehicles).where(eq(vehicles.customerId, customer.id))
  await db.delete(customers).where(like(customers.displayName, `InvTest-${stamp}%`))
  await pool.end()
})

describe('P1-20 invoices schema', () => {
  it('creates a draft with formatted invoice number and snapshots', async () => {
    const invoice = await createInvoiceDraft(db, {
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
    const invoice = await createInvoiceDraft(db, {
      customerId: customer.id,
      vehicleId: vehicle.id,
      invoiceDate: '2026-07-07',
      shopSuppliesPercent: '3.5',
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
