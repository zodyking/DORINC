// Phase 3 gate — E2E estimate + report flows (P3-14).
import { config } from 'dotenv'
import { eq, inArray, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { users } from '../../server/db/schema/auth'
import { customers } from '../../server/db/schema/customers'
import { estimateLineItems, estimates } from '../../server/db/schema/estimates'
import { invoiceLineItems, invoices } from '../../server/db/schema/invoices'
import { vehicles } from '../../server/db/schema/vehicles'
import { createCustomer } from '../../server/services/customers.service'
import {
  addEstimateLineItem,
  convertEstimateToInvoice,
  createEstimate,
  customerApproveEstimate,
  getEstimateDetail,
  sendEstimate,
} from '../../server/services/estimates.service'
import {
  approveInvoice,
  sendInvoice,
} from '../../server/services/invoices.service'
import { createPortalUser } from '../../server/services/portal.service'
import {
  getAgingReport,
  getMechanicProductivityReport,
  getRevenueReport,
} from '../../server/services/reports.service'
import { createVehicle } from '../../server/services/vehicles.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const portalPassword = 'phase3-gate-portal-123'

const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const ACTOR = anyUser!.id

const customer = await createCustomer(db, {
  displayName: `Phase3Gate-${stamp} Logistics`,
  accountKind: 'fleet',
  paymentTerms: 'net_30',
}, ACTOR)

const vehicle = await createVehicle(db, {
  customerId: customer.id,
  unitType: 'truck',
  busNumber: `P3G-${stamp}`,
  make: 'Kenworth',
  model: 'T680',
  year: 2020,
}, ACTOR)

const { hashPassword } = await import('../../server/auth/password')
const portalUser = await createPortalUser(db, {
  customerId: customer.id,
  name: 'Phase3 Portal',
  email: `phase3-gate-${stamp}@test.dorinc.local`,
  passwordHash: await hashPassword(portalPassword),
})

afterAll(async () => {
  const estimateRows = await db.select({ id: estimates.id }).from(estimates)
    .where(eq(estimates.customerId, customer.id))
  const estimateIds = estimateRows.map(r => r.id)

  const invoiceRows = await db.select({ id: invoices.id }).from(invoices)
    .where(eq(invoices.customerId, customer.id))
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

  await db.delete(users).where(like(users.email, `phase3-gate-${stamp}@test.dorinc.local`))
  await db.delete(vehicles).where(eq(vehicles.customerId, customer.id))
  await db.delete(customers).where(eq(customers.id, customer.id))
  await pool.end()
})

describe('P3-14 Phase 3 gate — estimate + report E2E', () => {
  it('runs estimate → portal approve → convert → invoice send → reports', async () => {
    const estimate = await createEstimate(db, {
      customerId: customer.id,
      vehicleId: vehicle.id,
      estimateDate: '2026-07-01',
      validUntil: '2026-08-01',
      customerNotes: 'Fleet brake service quote',
      creationSource: 'customer',
    }, ACTOR)

    await addEstimateLineItem(db, estimate.id, {
      lineType: 'labor',
      description: 'Brake pad replacement — front axle',
      quantity: '2',
      unitPrice: '185.00',
      sortOrder: 1,
    }, ACTOR)

    await addEstimateLineItem(db, estimate.id, {
      lineType: 'part',
      description: 'Ceramic brake pads (set)',
      quantity: '1',
      unitPrice: '240.00',
      taxable: true,
      sortOrder: 2,
    }, ACTOR)

    const { estimate: sentEstimate } = await sendEstimate(db, estimate.id, ACTOR)
    expect(sentEstimate.status).toBe('sent')

    const { estimate: approvedEstimate } = await customerApproveEstimate(
      db,
      estimate.id,
      customer.id,
      portalUser.id,
      'Approved for scheduling',
    )
    expect(approvedEstimate.status).toBe('approved')

    const detail = await getEstimateDetail(db, estimate.id)
    expect(detail.lineItems.length).toBe(2)
    expect(Number.parseFloat(detail.total)).toBeGreaterThan(0)

    const { invoice } = await convertEstimateToInvoice(db, estimate.id, ACTOR)
    expect(invoice.creationSource).toBe('estimate')
    expect(invoice.estimateId).toBe(estimate.id)
    expect(invoice.status).toBe('draft')

    const finalized = await approveInvoice(db, invoice.id, ACTOR, 'manager')
    expect(finalized.invoice.status).toBe('approved')

    const mailed = await sendInvoice(db, finalized.invoice.id, ACTOR)
    expect(mailed.invoice.status).toBe('sent')

    const revenue = await getRevenueReport(db, { from: '2026-07-01', to: '2026-07-31' })
    expect(revenue.summary.invoiceCount).toBeGreaterThanOrEqual(1)
    expect(Number.parseFloat(revenue.summary.invoicedTotal)).toBeGreaterThan(0)

    const aging = await getAgingReport(db)
    expect(aging.buckets.length).toBe(5)
    expect(aging.grandCount).toBeGreaterThanOrEqual(0)

    const productivity = await getMechanicProductivityReport(db, { from: '2026-07-01', to: '2026-07-31' })
    expect(productivity.mechanics).toBeDefined()
    expect(Array.isArray(productivity.mechanics)).toBe(true)
    expect(productivity.totals).toMatchObject({
      logsSubmitted: expect.any(Number),
      logsConverted: expect.any(Number),
      logsAwaitingReview: expect.any(Number),
    })
  })
})
