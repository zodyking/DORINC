// Integration tests for reports module (P3-06).
import { config } from 'dotenv'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { createCustomer } from '../../server/services/customers.service'
import { createInvoice } from '../../server/services/invoices.service'
import { sendAndDeliverInvoice } from '../helpers/invoice-send'
import {
  getAgingReport,
  getMechanicProductivityReport,
  getRevenueReport,
} from '../../server/services/reports.service'
import { createServiceLog } from '../../server/services/service-logs.service'
import { createVehicle } from '../../server/services/vehicles.service'
import { customers } from '../../server/db/schema/customers'
import { invoices } from '../../server/db/schema/invoices'
import { serviceLogs } from '../../server/db/schema/service-logs'
import { vehicles } from '../../server/db/schema/vehicles'
import { users } from '../../server/db/schema/auth'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const [actorRow] = await db.select({ id: users.id }).from(users).limit(1)
const ACTOR = actorRow!.id

const customer = await createCustomer(db, {
  displayName: `ReportsTest-${stamp}`,
  accountKind: 'individual',
}, ACTOR)

const vehicle = await createVehicle(db, {
  customerId: customer.id,
  unitType: 'truck',
  busNumber: `RPT-${stamp}`,
  make: 'Freightliner',
  model: 'Cascadia',
  year: 2020,
}, ACTOR)

afterAll(async () => {
  await db.delete(serviceLogs).where(eq(serviceLogs.customerId, customer.id))
  await db.delete(invoices).where(eq(invoices.customerId, customer.id))
  await db.delete(vehicles).where(eq(vehicles.customerId, customer.id))
  await db.delete(customers).where(eq(customers.id, customer.id))
  await pool.end()
})

describe('P3-06 reports module', () => {
  it('returns revenue summary for date range', async () => {
    const invoice = await createInvoice(db, {
      customerId: customer.id,
      vehicleId: vehicle.id,
      invoiceDate: '2026-07-01',
      dueDate: '2026-07-31',
    }, ACTOR)
    await sendAndDeliverInvoice(db, pool, invoice.id, ACTOR)

    const report = await getRevenueReport(db, { from: '2026-07-01', to: '2026-07-31' })
    expect(report.summary.invoiceCount).toBeGreaterThanOrEqual(1)
    expect(Number.parseFloat(report.summary.invoicedTotal)).toBeGreaterThanOrEqual(0)
    expect(report.monthly.length).toBeGreaterThanOrEqual(1)
  })

  it('returns aging buckets for open balances', async () => {
    const report = await getAgingReport(db)
    expect(report.buckets.length).toBe(5)
    expect(report.grandCount).toBeGreaterThanOrEqual(0)
    const totalFromBuckets = report.buckets.reduce((s, b) => s + Number.parseFloat(b.total), 0)
    expect(totalFromBuckets.toFixed(2)).toBe(Number.parseFloat(report.grandTotal).toFixed(2))
  })

  it('returns mechanic productivity grouped by submitter', async () => {
    await createServiceLog(db, {
      customerId: customer.id,
      vehicleId: vehicle.id,
      serviceDate: '2026-07-05',
      workType: 'diagnostic',
      complaint: 'Test log for reports',
    }, ACTOR)

    const report = await getMechanicProductivityReport(db, { from: '2026-07-01', to: '2026-07-31' })
    expect(report.totals.logsSubmitted).toBeGreaterThanOrEqual(1)
    expect(report.mechanics.some(m => m.logsSubmitted > 0)).toBe(true)
  })
})
