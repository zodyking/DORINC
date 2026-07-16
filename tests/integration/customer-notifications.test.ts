// Integration tests for customer-facing email notifications (P2-19).
import { config } from 'dotenv'
import { and, eq, inArray, like, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { users } from '../../server/db/schema/auth'
import { customerContacts, customers } from '../../server/db/schema/customers'
import { workerJobs } from '../../server/db/schema/jobs'
import { serviceRequests } from '../../server/db/schema/portal-requests'
import { invoices } from '../../server/db/schema/invoices'
import { vehicles } from '../../server/db/schema/vehicles'
import { addContact, createCustomer } from '../../server/services/customers.service'
import {
  addInvoiceLineItem,
  createInvoice,
} from '../../server/services/invoices.service'
import { sendAndDeliverInvoice } from '../helpers/invoice-send'
import { rejectPortalRequest } from '../../server/services/portal-request-review.service'
import { setPortalAccess } from '../../server/services/portal-access.service'
import { createGeneralRequest, createPortalUser } from '../../server/services/portal.service'
import { createVehicle } from '../../server/services/vehicles.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const emailDomain = `notify-${stamp}.dorinc.test`

const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const ACTOR = anyUser!.id

let customerId = ''
let portalUserId = ''
const createdJobIds: string[] = []

afterAll(async () => {
  if (customerId) {
    const { estimateLineItems, estimates } = await import('../../server/db/schema/estimates')
    const estRows = await db.select({ id: estimates.id }).from(estimates).where(eq(estimates.customerId, customerId))
    const estIds = estRows.map(r => r.id)
    if (estIds.length) {
      await db.delete(estimateLineItems).where(inArray(estimateLineItems.estimateId, estIds))
      await db.delete(estimates).where(inArray(estimates.id, estIds))
    }
    await db.delete(invoices).where(eq(invoices.customerId, customerId))
    await db.delete(serviceRequests).where(eq(serviceRequests.customerId, customerId))
    await db.delete(vehicles).where(eq(vehicles.customerId, customerId))
    await db.delete(customerContacts).where(eq(customerContacts.customerId, customerId))
    await db.delete(customers).where(eq(customers.id, customerId))
  }
  await db.delete(users).where(like(users.email, `%@${emailDomain}`))
  for (const jobId of createdJobIds) {
    await pool.query('DELETE FROM worker_jobs WHERE id = $1', [jobId])
  }
  await pool.end()
})

async function latestNotificationJob(kind: string) {
  const rows = await db
    .select()
    .from(workerJobs)
    .where(and(
      inArray(workerJobs.jobType, ['email_send', 'invoice_send']),
      sql`${workerJobs.payload}->>'notificationKind' = ${kind}`,
      sql`${workerJobs.payload}->>'customerId' = ${customerId}`,
    ))
    .orderBy(sql`${workerJobs.createdAt} DESC`)
    .limit(1)
  return rows[0] ?? null
}

describe('P2-19 customer-facing email notifications', () => {
  it('queues invoice_send when an invoice is sent', async () => {
    const customer = await createCustomer(db, {
      displayName: `Notify-${stamp}`,
      accountKind: 'fleet',
    }, ACTOR)
    customerId = customer.id

    const contactEmail = `billing@${emailDomain}`
    await addContact(db, customerId, {
      name: 'Billing Contact',
      email: contactEmail,
      isPrimary: true,
      isBilling: true,
    })
    await setPortalAccess(db, customerId, true, ACTOR)

    const vehicle = await createVehicle(db, {
      customerId,
      unitType: 'truck',
      busNumber: `NT-${stamp}`,
    }, ACTOR)

    const { hashPassword } = await import('../../server/auth/password')
    const portalUser = await createPortalUser(db, {
      customerId,
      name: 'Portal Notify',
      email: `portal@${emailDomain}`,
      passwordHash: await hashPassword('notify-test-123'),
    })
    portalUserId = portalUser.id

    const invoice = await createInvoice(db, {
      customerId,
      vehicleId: vehicle.id,
      invoiceDate: '2026-07-01',
      dueDate: '2026-08-01',
    }, ACTOR)
    await addInvoiceLineItem(db, invoice.id, {
      description: 'Diagnostics',
      quantity: '1',
      unitPrice: '120.00',
      lineType: 'labor',
      taxable: true,
    }, ACTOR)
    await sendAndDeliverInvoice(db, pool, invoice.id, ACTOR)

    const job = await latestNotificationJob('invoice_sent')
    expect(job).toBeTruthy()
    expect(job!.jobType).toBe('invoice_send')
    expect(job!.payload).toMatchObject({
      notificationKind: 'invoice_sent',
      recipientEmail: contactEmail,
      customerId,
      invoiceId: invoice.id,
    })
    expect(String(job!.payload.subject)).toContain('INV-')
    createdJobIds.push(job!.id)
  })

  it('queues request_status mail when staff rejects a portal request', async () => {
    const request = await createGeneralRequest(db, customerId, portalUserId, {
      subject: 'Hours question',
      message: 'What are your Saturday hours?',
    })

    await rejectPortalRequest(db, 'general', request.id, ACTOR, 'Not in service area this week')

    const job = await latestNotificationJob('request_status')
    expect(job).toBeTruthy()
    expect(job!.payload).toMatchObject({
      notificationKind: 'request_status',
      to: `portal@${emailDomain}`,
      requestKind: 'general',
      requestId: request.id,
      requestStatus: 'rejected',
    })
    expect(String(job!.payload.text)).toContain('rejected')
    createdJobIds.push(job!.id)
  })

  it('queues estimate_sent when estimate is sent to portal customer', async () => {
    const { createEstimate, sendEstimate } = await import('../../server/services/estimates.service')
    const { estimateLineItems, estimates } = await import('../../server/db/schema/estimates')

    const estimate = await createEstimate(db, {
      customerId,
      estimateDate: '2026-07-08',
    }, ACTOR)

    await sendEstimate(db, estimate.id, ACTOR)

    const job = await latestNotificationJob('estimate_sent')
    expect(job).toBeTruthy()
    expect(job!.payload).toMatchObject({
      notificationKind: 'estimate_sent',
      estimateId: estimate.id,
    })
    createdJobIds.push(job!.id)

    await db.delete(estimateLineItems).where(eq(estimateLineItems.estimateId, estimate.id))
    await db.delete(estimates).where(eq(estimates.id, estimate.id))
  })
})
