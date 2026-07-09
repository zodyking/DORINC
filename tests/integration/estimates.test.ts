// Integration tests for estimates schema + API (P3-01).
import { config } from 'dotenv'
import { eq, inArray, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { createCatalogItem, createCategory } from '../../server/services/catalog.service'
import { createCustomer } from '../../server/services/customers.service'
import {
  addEstimateLineItem,
  createEstimate,
  customerApproveEstimate,
  deleteEstimateLineItem,
  getEstimateDetail,
  listEstimateLineItems,
  recalculateEstimateTotals,
  sendEstimate,
  updateEstimateDraft,
  updateEstimateLineItem,
  voidEstimate,
} from '../../server/services/estimates.service'
import { createVehicle } from '../../server/services/vehicles.service'
import { estimateLineItems, estimates, formatEstimateNumber } from '../../server/db/schema/estimates'
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
  displayName: `EstTest-${stamp} Fleet Co`,
  accountKind: 'fleet',
  taxExempt: false,
  paymentTerms: 'net_30',
}, ACTOR)

const vehicle = await createVehicle(db, {
  customerId: customer.id,
  unitType: 'bus',
  busNumber: `EST-${stamp}`,
  make: 'Blue Bird',
  model: 'Vision',
  year: 2018,
}, ACTOR)

const category = await createCategory(db, { name: `EstCat-${stamp}`, sortOrder: 1 })

const catalogPart = await createCatalogItem(db, {
  itemType: 'part',
  sku: `EST-P-${stamp}`,
  name: `EstTest-${stamp} brake pad`,
  categoryId: category.id,
  defaultPrice: '89.99',
  taxable: true,
  uom: 'each',
}, ACTOR)

afterAll(async () => {
  const estimateRows = await db.select({ id: estimates.id }).from(estimates)
    .where(eq(estimates.customerId, customer.id))
  const estimateIds = estimateRows.map(r => r.id)
  if (estimateIds.length) {
    await db.delete(estimateLineItems).where(inArray(estimateLineItems.estimateId, estimateIds))
    await db.delete(estimates).where(inArray(estimates.id, estimateIds))
  }
  await db.delete(vehicles).where(eq(vehicles.customerId, customer.id))
  await db.delete(customers).where(like(customers.displayName, `EstTest-${stamp}%`))
  await pool.end()
})

describe('P3-01 estimates schema + API', () => {
  it('creates a draft with formatted estimate number and snapshots', async () => {
    const estimate = await createEstimate(db, {
      customerId: customer.id,
      vehicleId: vehicle.id,
      estimateDate: '2026-07-08',
      validUntil: '2026-08-08',
      complaint: 'Annual brake inspection',
    }, ACTOR)

    expect(estimate.status).toBe('draft')
    expect(estimate.estimateNumber).toBeGreaterThan(0)
    expect(formatEstimateNumber(estimate.estimateNumber)).toMatch(/^EST-\d{6}$/)
    expect(estimate.customerSnapshot.displayName).toBe(customer.displayName)
    expect(estimate.vehicleSnapshot?.busNumber).toBe(vehicle.busNumber)
  })

  it('stores catalog_snapshot and recalculates server-side totals', async () => {
    const estimate = await createEstimate(db, {
      customerId: customer.id,
      vehicleId: vehicle.id,
      estimateDate: '2026-07-08',
      shopSuppliesPercent: '3.5',
    }, ACTOR)

    await addEstimateLineItem(db, estimate.id, {
      lineType: 'labor',
      description: 'Brake inspection',
      quantity: '1',
      unitPrice: '95.00',
      sortOrder: 1,
    }, ACTOR)

    const partLine = await addEstimateLineItem(db, estimate.id, {
      lineType: 'part',
      catalogItemId: catalogPart.id,
      description: 'Front brake pads',
      quantity: '2',
      unitPrice: '89.99',
      sortOrder: 2,
    }, ACTOR)

    expect(partLine.catalogSnapshot?.catalogItemId).toBe(catalogPart.id)

    const { estimate: updated, totals } = await recalculateEstimateTotals(db, estimate.id, ACTOR)
    expect(totals.subtotal).toBe('274.98')
    expect(totals.feesAmount).toBe('9.62')
    expect(totals.total).toBe('284.60')
    expect(updated.total).toBe('284.60')
  })

  it('only allows draft edits and enforces status transitions', async () => {
    const estimate = await createEstimate(db, {
      customerId: customer.id,
      estimateDate: '2026-07-08',
    }, ACTOR)

    await addEstimateLineItem(db, estimate.id, {
      lineType: 'service',
      description: 'Diagnostic',
      quantity: '1',
      unitPrice: '75.00',
    }, ACTOR)

    const { estimate: sent } = await sendEstimate(db, estimate.id, ACTOR)
    expect(sent.status).toBe('sent')
    expect(sent.sentAt).toBeTruthy()

    await expect(updateEstimateDraft(db, estimate.id, { complaint: 'Changed' }, ACTOR))
      .rejects.toMatchObject({ code: 'NOT_EDITABLE' })

    const { estimate: approved } = await customerApproveEstimate(
      db,
      estimate.id,
      customer.id,
      ACTOR,
    )
    expect(approved.status).toBe('approved')
    expect(approved.customerApprovedAt).toBeTruthy()
  })

  it('supports line item update/delete and void', async () => {
    const estimate = await createEstimate(db, {
      customerId: customer.id,
      estimateDate: '2026-07-08',
    }, ACTOR)

    const line = await addEstimateLineItem(db, estimate.id, {
      lineType: 'fee',
      description: 'Shop supplies',
      quantity: '1',
      unitPrice: '25.00',
    }, ACTOR)

    const { line: updated } = await updateEstimateLineItem(db, estimate.id, line.id, {
      unitPrice: '30.00',
    }, ACTOR)
    expect(updated.lineAmount).toBe('30.00')

    await deleteEstimateLineItem(db, estimate.id, line.id, ACTOR)
    const lines = await listEstimateLineItems(db, estimate.id)
    expect(lines).toHaveLength(0)

    const { estimate: voided } = await voidEstimate(db, estimate.id, ACTOR)
    expect(voided.status).toBe('void')
  })

  it('returns detail with formatted number and line items', async () => {
    const estimate = await createEstimate(db, {
      customerId: customer.id,
      vehicleId: vehicle.id,
      estimateDate: '2026-07-08',
    }, ACTOR)

    await addEstimateLineItem(db, estimate.id, {
      lineType: 'labor',
      description: 'Oil change',
      quantity: '1',
      unitPrice: '120.00',
    }, ACTOR)

    const detail = await getEstimateDetail(db, estimate.id)
    expect(detail.estimateNumberFormatted).toMatch(/^EST-/)
    expect(detail.lineItems).toHaveLength(1)
    expect(detail.customerName).toBe(customer.displayName)
  })
})
