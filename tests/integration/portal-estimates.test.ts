// Integration tests for portal estimate approve/reject + convert to invoice (P3-03, P3-04).
import { config } from 'dotenv'
import { inArray, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { users } from '../../server/db/schema/auth'
import { customers } from '../../server/db/schema/customers'
import { estimateLineItems, estimates } from '../../server/db/schema/estimates'
import { invoiceLineItems, invoices } from '../../server/db/schema/invoices'
import { vehicles } from '../../server/db/schema/vehicles'
import {
  addEstimateLineItem,
  convertEstimateToInvoice,
  createEstimate,
  customerApproveEstimate,
  customerRejectEstimate,
  getPortalEstimateDetail,
  listPortalEstimates,
  sendEstimate,
} from '../../server/services/estimates.service'
import { createCustomer } from '../../server/services/customers.service'
import { createPortalUser } from '../../server/services/portal.service'
import { createVehicle } from '../../server/services/vehicles.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const password = 'portal-est-test-123'

const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const ACTOR = anyUser!.id

const customerA = await createCustomer(db, {
  displayName: `PortalEstA-${stamp}`,
  accountKind: 'fleet',
  paymentTerms: 'net_30',
}, ACTOR)

const customerB = await createCustomer(db, {
  displayName: `PortalEstB-${stamp}`,
  accountKind: 'fleet',
  paymentTerms: 'net_30',
}, ACTOR)

const vehicleA = await createVehicle(db, {
  customerId: customerA.id,
  unitType: 'truck',
  busNumber: `PE-${stamp}`,
  make: 'Freightliner',
  model: 'Cascadia',
  year: 2019,
}, ACTOR)

const { hashPassword } = await import('../../server/auth/password')
const passwordHash = await hashPassword(password)

const portalUserA = await createPortalUser(db, {
  customerId: customerA.id,
  name: 'Portal Est A',
  email: `portal-est-a-${stamp}@test.dorinc.local`,
  passwordHash,
})

await createPortalUser(db, {
  customerId: customerB.id,
  name: 'Portal Est B',
  email: `portal-est-b-${stamp}@test.dorinc.local`,
  passwordHash,
})

let sentEstimateId = ''
let approvedEstimateId = ''

async function seedSentEstimate() {
  const estimate = await createEstimate(db, {
    customerId: customerA.id,
    vehicleId: vehicleA.id,
    estimateDate: '2026-07-05',
    validUntil: '2026-08-05',
    customerNotes: 'Please review brake work quote.',
  }, ACTOR)

  await addEstimateLineItem(db, estimate.id, {
    lineType: 'labor',
    description: 'Brake inspection and adjustment',
    quantity: '2',
    unitPrice: '125.00',
    sortOrder: 1,
  }, ACTOR)

  await sendEstimate(db, estimate.id, ACTOR)
  sentEstimateId = estimate.id
  return estimate.id
}

async function seedApprovedEstimate() {
  const estimate = await createEstimate(db, {
    customerId: customerA.id,
    vehicleId: vehicleA.id,
    estimateDate: '2026-07-06',
  }, ACTOR)

  await addEstimateLineItem(db, estimate.id, {
    lineType: 'service',
    description: 'Oil change — fleet unit',
    quantity: '1',
    unitPrice: '89.00',
    sortOrder: 1,
  }, ACTOR)

  await sendEstimate(db, estimate.id, ACTOR)
  await customerApproveEstimate(db, estimate.id, customerA.id, portalUserA.id, 'Looks good')
  approvedEstimateId = estimate.id
  return estimate.id
}

sentEstimateId = await seedSentEstimate()
approvedEstimateId = await seedApprovedEstimate()

afterAll(async () => {
  const custIds = [customerA.id, customerB.id]
  const estimateRows = await db.select({ id: estimates.id }).from(estimates)
    .where(inArray(estimates.customerId, custIds))
  const estimateIds = estimateRows.map(r => r.id)

  const invoiceRows = await db.select({ id: invoices.id }).from(invoices)
    .where(inArray(invoices.customerId, custIds))
  const invoiceIds = invoiceRows.map(r => r.id)

  if (invoiceIds.length) {
    await db.update(estimates)
      .set({ convertedInvoiceId: null })
      .where(inArray(estimates.convertedInvoiceId, invoiceIds))
    await db.update(invoices)
      .set({ estimateId: null })
      .where(inArray(invoices.id, invoiceIds))
    await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, invoiceIds))
    await db.delete(invoices).where(inArray(invoices.id, invoiceIds))
  }

  if (estimateIds.length) {
    await db.delete(estimateLineItems).where(inArray(estimateLineItems.estimateId, estimateIds))
    await db.delete(estimates).where(inArray(estimates.id, estimateIds))
  }

  await db.delete(users).where(like(users.email, `portal-est-%${stamp}@test.dorinc.local`))
  await db.delete(vehicles).where(inArray(vehicles.customerId, custIds))
  await db.delete(customers).where(inArray(customers.id, custIds))
  await pool.end()
})

describe('P3-03 portal estimates list + detail', () => {
  it('returns estimate detail with line items for own customer', async () => {
    const detail = await getPortalEstimateDetail(db, customerA.id, sentEstimateId)
    expect(detail.estimateNumberFormatted).toMatch(/^EST-/)
    expect(detail.lineItems.length).toBeGreaterThan(0)
    expect(detail.canRespond).toBe(true)
    expect(detail.customerNotes).toContain('brake')
  })

  it('returns NOT_FOUND when another customer requests estimate detail', async () => {
    await expect(getPortalEstimateDetail(db, customerB.id, sentEstimateId))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('lists estimates only for scoped customer', async () => {
    const listA = await listPortalEstimates(db, customerA.id)
    const listB = await listPortalEstimates(db, customerB.id)
    expect(listA.some(e => e.id === sentEstimateId)).toBe(true)
    expect(listB.some(e => e.id === sentEstimateId)).toBe(false)
  })
})

describe('P3-03 portal estimate approve/reject', () => {
  it('allows customer to approve a sent estimate', async () => {
    const { estimate } = await customerApproveEstimate(
      db,
      sentEstimateId,
      customerA.id,
      portalUserA.id,
      'Approved — proceed',
    )
    expect(estimate.status).toBe('approved')
    expect(estimate.customerResponseNotes).toBe('Approved — proceed')
  })

  it('rejects invalid transition after approval', async () => {
    await expect(customerRejectEstimate(db, sentEstimateId, customerA.id, portalUserA.id))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })

  it('allows customer to reject a new sent estimate', async () => {
    const estimate = await createEstimate(db, {
      customerId: customerA.id,
      vehicleId: vehicleA.id,
      estimateDate: '2026-07-07',
    }, ACTOR)
    await addEstimateLineItem(db, estimate.id, {
      lineType: 'fee',
      description: 'Diagnostic fee',
      quantity: '1',
      unitPrice: '75.00',
    }, ACTOR)
    await sendEstimate(db, estimate.id, ACTOR)

    const { estimate: rejected } = await customerRejectEstimate(
      db,
      estimate.id,
      customerA.id,
      portalUserA.id,
      'Too expensive',
    )
    expect(rejected.status).toBe('rejected')
  })
})

describe('P3-04 convert approved estimate to invoice', () => {
  it('creates draft invoice from approved estimate with line items', async () => {
    const { invoice, estimate } = await convertEstimateToInvoice(db, approvedEstimateId, ACTOR)

    expect(estimate.status).toBe('converted')
    expect(estimate.convertedInvoiceId).toBe(invoice.id)
    expect(invoice.creationSource).toBe('estimate')
    expect(invoice.estimateId).toBe(approvedEstimateId)
    expect(invoice.status).toBe('draft')
    expect(Number.parseFloat(invoice.total)).toBeGreaterThan(0)

    const lines = await db.select().from(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, [invoice.id]))
    expect(lines.length).toBe(1)
    expect(lines[0]!.description).toContain('Oil change')
  })

  it('rejects converting an already converted estimate', async () => {
    await expect(convertEstimateToInvoice(db, approvedEstimateId, ACTOR))
      .rejects.toMatchObject({ code: 'ALREADY_CONVERTED' })
  })

  it('rejects converting a sent (unapproved) estimate', async () => {
    const estimate = await createEstimate(db, {
      customerId: customerA.id,
      vehicleId: vehicleA.id,
      estimateDate: '2026-07-08',
    }, ACTOR)
    await addEstimateLineItem(db, estimate.id, {
      lineType: 'labor',
      description: 'Pending work',
      quantity: '1',
      unitPrice: '50.00',
    }, ACTOR)
    await sendEstimate(db, estimate.id, ACTOR)

    await expect(convertEstimateToInvoice(db, estimate.id, ACTOR))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })
})
