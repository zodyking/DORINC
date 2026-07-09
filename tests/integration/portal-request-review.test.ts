// Integration tests for staff portal request review queues + invoice revision flow (P2-09, P2-10).
import { config } from 'dotenv'
import { eq, inArray, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { users } from '../../server/db/schema/auth'
import { customers } from '../../server/db/schema/customers'
import {
  invoiceChangeRequests,
  portalGeneralRequests,
  serviceRequests,
  vehicleChangeRequests,
} from '../../server/db/schema/portal-requests'
import { invoiceLineItems, invoices } from '../../server/db/schema/invoices'
import { vehicles } from '../../server/db/schema/vehicles'
import { createCustomer } from '../../server/services/customers.service'
import {
  addInvoiceLineItem,
  approveInvoice,
  createInvoice,
  getInvoice,
  listInvoiceLineItems,
  sendInvoice,
} from '../../server/services/invoices.service'
import {
  approveInvoiceChangeRequest,
  approveServiceRequest,
  approveVehicleChangeRequest,
  countPendingPortalRequests,
  listStaffPortalRequests,
  PortalRequestReviewError,
  rejectPortalRequest,
} from '../../server/services/portal-request-review.service'
import {
  createGeneralRequest,
  createInvoiceChangeRequest,
  createPortalUser,
  createServiceRequest,
  createVehicleChangeRequest,
} from '../../server/services/portal.service'
import { createVehicle, getVehicle } from '../../server/services/vehicles.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()

const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const ACTOR = anyUser!.id

const customer = await createCustomer(db, {
  displayName: `StaffReq-${stamp}`,
  accountKind: 'fleet',
  paymentTerms: 'net_30',
}, ACTOR)

const vehicle = await createVehicle(db, {
  customerId: customer.id,
  unitType: 'truck',
  busNumber: `SR-${stamp}`,
  make: 'Freightliner',
  model: 'Cascadia',
  year: 2019,
  notes: 'Original notes',
}, ACTOR)

const { hashPassword } = await import('../../server/auth/password')
const passwordHash = await hashPassword('staff-req-test-123')

const portalUser = await createPortalUser(db, {
  customerId: customer.id,
  name: 'Staff Req Portal',
  email: `staff-req-${stamp}@test.dorinc.local`,
  passwordHash,
})

let sourceInvoiceId = ''
const createdInvoiceIds: string[] = []

async function seedSentInvoice() {
  const invoice = await createInvoice(db, {
    customerId: customer.id,
    vehicleId: vehicle.id,
    invoiceDate: '2026-07-01',
    dueDate: '2026-08-01',
  }, ACTOR)
  await addInvoiceLineItem(db, invoice.id, {
    description: 'Brake service',
    quantity: '1',
    unitPrice: '450.00',
    lineType: 'labor',
    taxable: true,
  }, ACTOR)
  await approveInvoice(db, invoice.id, ACTOR)
  await sendInvoice(db, invoice.id, ACTOR)
  sourceInvoiceId = invoice.id
  createdInvoiceIds.push(invoice.id)
}

await seedSentInvoice()

afterAll(async () => {
  await db.delete(serviceRequests).where(eq(serviceRequests.customerId, customer.id))
  await db.delete(invoiceChangeRequests).where(eq(invoiceChangeRequests.customerId, customer.id))
  await db.delete(vehicleChangeRequests).where(eq(vehicleChangeRequests.customerId, customer.id))
  await db.delete(portalGeneralRequests).where(eq(portalGeneralRequests.customerId, customer.id))
  if (createdInvoiceIds.length) {
    await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, createdInvoiceIds))
    await db.delete(invoices).where(inArray(invoices.id, createdInvoiceIds))
  }
  await db.delete(users).where(like(users.email, `staff-req-${stamp}@test.dorinc.local`))
  await db.delete(vehicles).where(eq(vehicles.customerId, customer.id))
  await db.delete(customers).where(eq(customers.id, customer.id))
  await pool.end()
})

describe('P2-09 staff portal request review queue', () => {
  it('lists pending portal requests for staff review', async () => {
    await createServiceRequest(db, customer.id, portalUser.id, {
      vehicleId: vehicle.id,
      serviceCategory: 'Repair / breakdown',
      urgency: 'urgent',
      description: 'Unit down at yard',
    })

    const pendingBefore = await countPendingPortalRequests(db)
    expect(pendingBefore).toBeGreaterThanOrEqual(1)

    const list = await listStaffPortalRequests(db, { status: 'pending', kind: 'service' })
    expect(list.items.some(item => item.summary.includes('Unit down'))).toBe(true)
    expect(list.items.some(item => item.customerName === customer.displayName)).toBe(true)
  })

  it('rejects a pending request with reason', async () => {
    const request = await createGeneralRequest(db, customer.id, portalUser.id, {
      subject: 'Reject me',
      message: 'Please reject this test request',
    })

    const rejected = await rejectPortalRequest(db, 'general', request.id, ACTOR, 'Not actionable')
    expect(rejected.status).toBe('rejected')
    expect(rejected.reviewReason).toBe('Not actionable')
  })

  it('approves a service request by creating a draft invoice', async () => {
    const request = await createServiceRequest(db, customer.id, portalUser.id, {
      vehicleId: vehicle.id,
      serviceCategory: 'Preventive maintenance',
      urgency: 'normal',
      description: 'Oil change due',
      location: 'Main shop',
    })

    const { request: approved, invoice } = await approveServiceRequest(db, request.id, ACTOR, 'Scheduled next week')
    createdInvoiceIds.push(invoice.id)

    expect(approved.status).toBe('approved')
    expect(approved.resultInvoiceId).toBe(invoice.id)
    expect(invoice.creationSource).toBe('service_request')
    expect(invoice.serviceRequestId).toBe(request.id)
    expect(invoice.status).toBe('draft')
    expect(invoice.complaint).toBe('Oil change due')
  })

  it('approves a vehicle correction by appending vehicle notes', async () => {
    const request = await createVehicleChangeRequest(db, customer.id, portalUser.id, {
      vehicleId: vehicle.id,
      subject: 'VIN correction',
      description: 'Updated VIN on door plate',
    })

    const { request: approved } = await approveVehicleChangeRequest(db, request.id, ACTOR, 'Verified with customer')
    expect(approved.status).toBe('approved')

    const updated = await getVehicle(db, vehicle.id)
    expect(updated.notes).toContain('VIN correction')
    expect(updated.notes).toContain('Verified with customer')
  })

  it('blocks double review', async () => {
    const request = await createVehicleChangeRequest(db, customer.id, portalUser.id, {
      vehicleId: vehicle.id,
      subject: 'Already reviewed',
      description: 'Should not approve twice',
    })
    await approveVehicleChangeRequest(db, request.id, ACTOR)
    await expect(approveVehicleChangeRequest(db, request.id, ACTOR)).rejects.toThrow(PortalRequestReviewError)
  })
})

describe('P2-10 invoice correction revision flow', () => {
  it('creates a revision draft when an invoice-linked correction is approved', async () => {
    const request = await createInvoiceChangeRequest(db, customer.id, portalUser.id, {
      invoiceId: sourceInvoiceId,
      topic: 'Line item clarification',
      description: 'Please adjust labor hours on line 1',
    })

    const original = await getInvoice(db, sourceInvoiceId)
    const originalLines = await listInvoiceLineItems(db, sourceInvoiceId)

    const { request: approved, revision } = await approveInvoiceChangeRequest(db, request.id, ACTOR, 'Revision opened')
    expect(approved.status).toBe('approved')
    expect(revision).not.toBeNull()
    createdInvoiceIds.push(revision!.id)

    expect(revision!.creationSource).toBe('revision')
    expect(revision!.sourceInvoiceId).toBe(sourceInvoiceId)
    expect(revision!.status).toBe('draft')

    const unchanged = await getInvoice(db, sourceInvoiceId)
    expect(unchanged.status).toBe(original.status)
    expect(unchanged.invoiceNumber).toBe(original.invoiceNumber)

    const revLines = await listInvoiceLineItems(db, revision!.id)
    expect(revLines.length).toBe(originalLines.length)
    expect(revision!.internalNotes).toContain('Portal correction')
    expect(revision!.internalNotes).toContain('Revision opened')
  })

  it('approves general billing inquiries without a linked invoice', async () => {
    const request = await createInvoiceChangeRequest(db, customer.id, portalUser.id, {
      topic: 'Payment plan / terms',
      description: 'Need to discuss terms',
    })

    const { request: approved, revision } = await approveInvoiceChangeRequest(db, request.id, ACTOR)
    expect(approved.status).toBe('approved')
    expect(revision).toBeNull()
    expect(approved.resultInvoiceId).toBeNull()
  })

  it('rejects revision when source invoice is not revisable', async () => {
    const draft = await createInvoice(db, {
      customerId: customer.id,
      vehicleId: vehicle.id,
      invoiceDate: '2026-07-02',
    }, ACTOR)
    createdInvoiceIds.push(draft.id)

    const [request] = await db.insert(invoiceChangeRequests).values({
      customerId: customer.id,
      submittedBy: portalUser.id,
      invoiceId: draft.id,
      topic: 'Should fail',
      description: 'Draft invoices cannot spawn revisions',
    }).returning()

    await expect(approveInvoiceChangeRequest(db, request!.id, ACTOR)).rejects.toMatchObject({ code: 'INVALID_INVOICE' })
  })
})
