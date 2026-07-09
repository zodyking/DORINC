// Integration tests for staff deletion request workflow (archive/void with admin approval).
import { config } from 'dotenv'
import { eq, inArray, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { users } from '../../server/db/schema/auth'
import { customers } from '../../server/db/schema/customers'
import { entityDeletionRequests } from '../../server/db/schema/deletion-requests'
import { invoiceLineItems, invoices } from '../../server/db/schema/invoices'
import { serviceLogs } from '../../server/db/schema/service-logs'
import { vehicles } from '../../server/db/schema/vehicles'
import { createCustomer, getCustomer } from '../../server/services/customers.service'
import {
  approveDeletionRequest,
  createDeletionRequest,
  DeletionRequestsServiceError,
  listDeletionRequests,
  rejectDeletionRequest,
} from '../../server/services/deletion-requests.service'
import {
  addInvoiceLineItem,
  approveInvoice,
  createInvoice,
  getInvoice,
} from '../../server/services/invoices.service'
import { createServiceLog } from '../../server/services/service-logs.service'
import { createVehicle, getVehicle } from '../../server/services/vehicles.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()

const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const ACTOR = anyUser!.id

const customer = await createCustomer(db, {
  displayName: `DelReq-${stamp}`,
  accountKind: 'fleet',
  paymentTerms: 'net_30',
}, ACTOR)

const vehicle = await createVehicle(db, {
  customerId: customer.id,
  unitType: 'truck',
  busNumber: `DR-${stamp}`,
  make: 'Freightliner',
  model: 'Cascadia',
  year: 2019,
}, ACTOR)

const serviceLog = await createServiceLog(db, {
  customerId: customer.id,
  vehicleId: vehicle.id,
  workType: 'maintenance',
  serviceDate: '2026-07-01',
  complaint: 'Test deletion request',
}, ACTOR)

const draftInvoice = await createInvoice(db, {
  customerId: customer.id,
  vehicleId: vehicle.id,
  invoiceDate: '2026-07-01',
  dueDate: '2026-08-01',
}, ACTOR)
await addInvoiceLineItem(db, draftInvoice.id, {
  description: 'Oil change',
  quantity: '1',
  unitPrice: '89.00',
  lineType: 'labor',
  taxable: true,
}, ACTOR)

const createdRequestIds: string[] = []
const createdInvoiceIds = [draftInvoice.id]

afterAll(async () => {
  if (createdRequestIds.length) {
    await db.delete(entityDeletionRequests).where(inArray(entityDeletionRequests.id, createdRequestIds))
  }
  await db.delete(entityDeletionRequests).where(like(entityDeletionRequests.entityLabel, `%DelReq-${stamp}%`))
  if (createdInvoiceIds.length) {
    await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, createdInvoiceIds))
    await db.delete(invoices).where(inArray(invoices.id, createdInvoiceIds))
  }
  await db.delete(serviceLogs).where(eq(serviceLogs.customerId, customer.id))
  await db.delete(vehicles).where(eq(vehicles.customerId, customer.id))
  await db.delete(customers).where(eq(customers.id, customer.id))
  await pool.end()
})

describe('deletion request workflow', () => {
  it('creates a pending request and blocks duplicates', async () => {
    const row = await createDeletionRequest(
      db,
      'customer',
      customer.id,
      'Duplicate customer account created in error',
      ACTOR,
    )
    createdRequestIds.push(row.id)

    expect(row.status).toBe('pending')
    expect(row.entityLabel).toContain(`DelReq-${stamp}`)

    await expect(createDeletionRequest(
      db,
      'customer',
      customer.id,
      'Second request should fail',
      ACTOR,
    )).rejects.toMatchObject({ code: 'DUPLICATE_PENDING' })
  })

  it('lists pending requests for reviewers', async () => {
    const list = await listDeletionRequests(db, { status: 'pending', entityType: 'customer' })
    expect(list.items.some(i => i.entityId === customer.id)).toBe(true)
    expect(list.pending).toBeGreaterThanOrEqual(1)
  })

  it('rejects a pending request without archiving the record', async () => {
    const pending = await listDeletionRequests(db, { entityId: customer.id, status: 'pending' })
    const row = pending.items[0]!
    const { request } = await rejectDeletionRequest(db, row.id, ACTOR, 'Keep for now')
    expect(request.status).toBe('rejected')
    expect(request.reviewReason).toBe('Keep for now')

    const stillActive = await getCustomer(db, customer.id)
    expect(stillActive.archivedAt).toBeNull()
  })

  it('blocks deletion request for paid invoices', async () => {
    const paidInvoice = await createInvoice(db, {
      customerId: customer.id,
      vehicleId: vehicle.id,
      invoiceDate: '2026-07-02',
      dueDate: '2026-08-02',
    }, ACTOR)
    createdInvoiceIds.push(paidInvoice.id)
    await addInvoiceLineItem(db, paidInvoice.id, {
      description: 'Paid work',
      quantity: '1',
      unitPrice: '100.00',
      lineType: 'labor',
      taxable: true,
    }, ACTOR)
    await approveInvoice(db, paidInvoice.id, ACTOR)

    await db.update(invoices)
      .set({ status: 'paid', amountPaid: '100.00', balanceDue: '0.00' })
      .where(eq(invoices.id, paidInvoice.id))

    await expect(createDeletionRequest(
      db,
      'invoice',
      paidInvoice.id,
      'Should not delete paid invoice',
      ACTOR,
    )).rejects.toBeInstanceOf(DeletionRequestsServiceError)
  })

  it('approves vehicle deletion and archives the unit', async () => {
    const created = await createDeletionRequest(
      db,
      'vehicle',
      vehicle.id,
      'Unit sold and removed from fleet',
      ACTOR,
    )
    createdRequestIds.push(created.id)

    const { request } = await approveDeletionRequest(db, created.id, ACTOR, 'Confirmed with fleet manager')
    expect(request.status).toBe('approved')

    const archived = await getVehicle(db, vehicle.id)
    expect(archived.archivedAt).not.toBeNull()
  })

  it('approves draft invoice deletion and voids the invoice', async () => {
    const created = await createDeletionRequest(
      db,
      'invoice',
      draftInvoice.id,
      'Draft created against wrong vehicle',
      ACTOR,
    )
    createdRequestIds.push(created.id)

    const { request } = await approveDeletionRequest(db, created.id, ACTOR)
    expect(request.status).toBe('approved')

    const voided = await getInvoice(db, draftInvoice.id)
    expect(voided.status).toBe('void')
  })

  it('approves service log deletion and archives the log', async () => {
    const created = await createDeletionRequest(
      db,
      'service_log',
      serviceLog.id,
      'Duplicate log entry',
      ACTOR,
    )
    createdRequestIds.push(created.id)

    const { request } = await approveDeletionRequest(db, created.id, ACTOR)
    expect(request.status).toBe('approved')
    expect(request.entityType).toBe('service_log')
  })
})
