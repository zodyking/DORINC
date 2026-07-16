// Integration tests for portal requests — all types submit to review queues (P2-07).
import { config } from 'dotenv'
import { inArray, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { users } from '../../server/db/schema/auth'
import { customers } from '../../server/db/schema/customers'
import {
  invoiceChangeRequests,
  newVehicleRequests,
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
  listInvoiceLineItems,
  sendInvoice,
} from '../../server/services/invoices.service'
import {
  createGeneralRequest,
  createInvoiceChangeRequest,
  createPortalUser,
  createServiceRequest,
  createVehicleChangeRequest,
  listPortalRequests,
  PortalServiceError,
} from '../../server/services/portal.service'
import { createVehicle } from '../../server/services/vehicles.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()

const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const ACTOR = anyUser!.id

const customerA = await createCustomer(db, {
  displayName: `PortalReqA-${stamp}`,
  accountKind: 'fleet',
  paymentTerms: 'net_30',
}, ACTOR)

const customerB = await createCustomer(db, {
  displayName: `PortalReqB-${stamp}`,
  accountKind: 'fleet',
  paymentTerms: 'net_30',
}, ACTOR)

const vehicleA = await createVehicle(db, {
  customerId: customerA.id,
  unitType: 'truck',
  busNumber: `PR-${stamp}`,
  make: 'Freightliner',
  model: 'Cascadia',
  year: 2019,
}, ACTOR)

const vehicleB = await createVehicle(db, {
  customerId: customerB.id,
  unitType: 'truck',
  busNumber: `PRB-${stamp}`,
  make: 'International',
  model: 'MV607',
  year: 2020,
}, ACTOR)

const { hashPassword } = await import('../../server/auth/password')
const passwordHash = await hashPassword('portal-req-test-123')

const portalUserA = await createPortalUser(db, {
  customerId: customerA.id,
  name: 'Portal Req A',
  email: `portal-req-a-${stamp}@test.dorinc.local`,
  passwordHash,
})

const portalUserB = await createPortalUser(db, {
  customerId: customerB.id,
  name: 'Portal Req B',
  email: `portal-req-b-${stamp}@test.dorinc.local`,
  passwordHash,
})

let invoiceAId = ''

async function seedSentInvoice() {
  const invoice = await createInvoice(db, {
    customerId: customerA.id,
    vehicleId: vehicleA.id,
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
  invoiceAId = invoice.id
}

await seedSentInvoice()

afterAll(async () => {
  const custIds = [customerA.id, customerB.id]
  await db.delete(serviceRequests).where(inArray(serviceRequests.customerId, custIds))
  await db.delete(invoiceChangeRequests).where(inArray(invoiceChangeRequests.customerId, custIds))
  await db.delete(vehicleChangeRequests).where(inArray(vehicleChangeRequests.customerId, custIds))
  await db.delete(portalGeneralRequests).where(inArray(portalGeneralRequests.customerId, custIds))
  await db.delete(newVehicleRequests).where(inArray(newVehicleRequests.customerId, custIds))
  await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, [invoiceAId]))
  await db.delete(invoices).where(inArray(invoices.customerId, custIds))
  await db.delete(users).where(like(users.email, `portal-req-%${stamp}@test.dorinc.local`))
  await db.delete(vehicles).where(inArray(vehicles.customerId, custIds))
  await db.delete(customers).where(inArray(customers.id, custIds))
  await pool.end()
})

describe('P2-07 portal service request', () => {
  it('creates a pending service request for shop review', async () => {
    const request = await createServiceRequest(db, customerA.id, portalUserA.id, {
      vehicleId: vehicleA.id,
      serviceCategory: 'Preventive maintenance',
      urgency: 'urgent',
      preferredDate: '2026-07-10',
      location: 'Main yard',
      description: 'DEF system check needed',
    })

    expect(request.status).toBe('pending')
    expect(request.vehicleId).toBe(vehicleA.id)
    expect(request.customerId).toBe(customerA.id)
  })

  it('rejects vehicles outside customer scope', async () => {
    await expect(createServiceRequest(db, customerA.id, portalUserA.id, {
      vehicleId: vehicleB.id,
      serviceCategory: 'Repair / breakdown',
      urgency: 'normal',
      description: 'Should fail IDOR',
    })).rejects.toThrow(PortalServiceError)
  })
})

describe('P2-07 portal invoice change request', () => {
  it('creates a pending billing request tied to an invoice', async () => {
    const request = await createInvoiceChangeRequest(db, customerA.id, portalUserA.id, {
      invoiceId: invoiceAId,
      topic: 'Line item clarification',
      description: 'Please clarify brake labor hours on line 1',
    })

    expect(request.status).toBe('pending')
    expect(request.invoiceId).toBe(invoiceAId)
  })

  it('creates a structured line item correction request', async () => {
    const lines = await listInvoiceLineItems(db, invoiceAId)
    const request = await createInvoiceChangeRequest(db, customerA.id, portalUserA.id, {
      invoiceId: invoiceAId,
      topic: 'Line item correction',
      lineItemCorrection: {
        lineItemId: lines[0]!.id,
        description: lines[0]!.description,
        quantity: '0.50',
        unitPrice: '450.00',
        notes: 'Half hour only',
      },
    })

    expect(request.status).toBe('pending')
    expect(request.correctionPayload).toMatchObject({ kind: 'line_item' })
  })

  it('allows billing requests without invoice reference', async () => {
    const request = await createInvoiceChangeRequest(db, customerA.id, portalUserA.id, {
      topic: 'Payment plan / terms',
      description: 'Need to discuss payment terms',
    })

    expect(request.status).toBe('pending')
    expect(request.invoiceId).toBeNull()
  })
})

describe('P2-07 portal vehicle change request', () => {
  it('creates a pending vehicle correction request', async () => {
    const request = await createVehicleChangeRequest(db, customerA.id, portalUserA.id, {
      vehicleId: vehicleA.id,
      subject: 'Update VIN on file',
      description: 'VIN plate replaced — new VIN attached',
    })

    expect(request.status).toBe('pending')
    expect(request.vehicleId).toBe(vehicleA.id)
  })
})

describe('P2-07 portal general request', () => {
  it('creates a pending general message', async () => {
    const request = await createGeneralRequest(db, customerA.id, portalUserA.id, {
      subject: 'Update billing contact email',
      message: 'Please route invoices to fleet@example.com',
    })

    expect(request.status).toBe('pending')
    expect(request.subject).toBe('Update billing contact email')
  })
})

describe('P2-07 portal request history', () => {
  it('lists only requests for the scoped customer', async () => {
    await createGeneralRequest(db, customerB.id, portalUserB.id, {
      subject: 'Other customer message',
      message: 'Should not appear for customer A',
    })

    const listA = await listPortalRequests(db, customerA.id)
    const listB = await listPortalRequests(db, customerB.id)

    expect(listA.length).toBeGreaterThanOrEqual(4)
    expect(listA.some(item => item.kind === 'service')).toBe(true)
    expect(listA.some(item => item.kind === 'billing')).toBe(true)
    expect(listA.some(item => item.kind === 'vehicle_change')).toBe(true)
    expect(listA.some(item => item.kind === 'general')).toBe(true)
    expect(listA.some(item => item.title.includes('Other customer'))).toBe(false)
    expect(listB.some(item => item.title.includes('Other customer'))).toBe(true)
  })
})
