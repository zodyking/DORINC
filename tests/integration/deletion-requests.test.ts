// Integration tests for staff deletion request workflow (hard delete with admin approval).
import { config } from 'dotenv'
import { eq, inArray, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { users } from '../../server/db/schema/auth'
import { customers } from '../../server/db/schema/customers'
import { entityDeletionRequests } from '../../server/db/schema/deletion-requests'
import { emailIngestSuppressions, emailMessageMeta, emailThreads } from '../../server/db/schema/email-inbox'
import { invoiceLineItems, invoices } from '../../server/db/schema/invoices'
import { serviceLogs } from '../../server/db/schema/service-logs'
import { vehicles } from '../../server/db/schema/vehicles'
import {
  conversationParticipants,
  conversations,
  messages,
} from '../../server/db/schema/messages'
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
  createInvoice,
  getInvoice,
} from '../../server/services/invoices.service'
import { convertServiceLogToInvoice, createServiceLog, getServiceLog, transitionServiceLog } from '../../server/services/service-logs.service'
import { createVehicle, getVehicle } from '../../server/services/vehicles.service'
import { INVOICE_LINK_RELEASED_REASON } from '../../server/services/invoice-dependents.service'
import {
  createOrGetDmConversation,
  getConversationDeletionLabel,
  sendMessage,
} from '../../server/services/messages.service'
import { suppressesInboundEmail } from '../../server/services/email-ingest-suppression.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()

const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const [secondUser] = await db.select({ id: users.id }).from(users).offset(1).limit(1)
const ACTOR = anyUser!.id
const ACTOR_B = secondUser?.id ?? anyUser!.id

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
const createdConversationIds: string[] = []
const createdSuppressionIds: string[] = []

afterAll(async () => {
  if (createdRequestIds.length) {
    await db.delete(entityDeletionRequests).where(inArray(entityDeletionRequests.id, createdRequestIds))
  }
  if (createdSuppressionIds.length) {
    await db.delete(emailIngestSuppressions)
      .where(inArray(emailIngestSuppressions.internetMessageId, createdSuppressionIds))
  }
  await db.delete(entityDeletionRequests).where(like(entityDeletionRequests.entityLabel, `%DelReq-${stamp}%`))
  if (createdInvoiceIds.length) {
    await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, createdInvoiceIds))
    await db.delete(invoices).where(inArray(invoices.id, createdInvoiceIds))
  }
  await db.delete(serviceLogs).where(eq(serviceLogs.customerId, customer.id))
  await db.delete(vehicles).where(eq(vehicles.customerId, customer.id))
  await db.delete(customers).where(eq(customers.id, customer.id))
  for (const id of createdConversationIds) {
    await db.delete(messages).where(eq(messages.conversationId, id))
    await db.delete(conversationParticipants).where(eq(conversationParticipants.conversationId, id))
    await db.delete(conversations).where(eq(conversations.id, id))
  }
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

  it('approves vehicle deletion and hard-deletes the unit while keeping invoice snapshots', async () => {
    const v = await createVehicle(db, {
      customerId: customer.id,
      unitType: 'truck',
      busNumber: `DR-DEL-${stamp}`,
      make: 'Kenworth',
      model: 'T680',
      year: 2021,
    }, ACTOR)
    const inv = await createInvoice(db, {
      customerId: customer.id,
      vehicleId: v.id,
      invoiceDate: '2026-07-04',
      dueDate: '2026-08-04',
    }, ACTOR)
    createdInvoiceIds.push(inv.id)
    await addInvoiceLineItem(db, inv.id, {
      description: 'Inspection',
      quantity: '1',
      unitPrice: '50.00',
      lineType: 'labor',
      taxable: true,
    }, ACTOR)

    const before = await getInvoice(db, inv.id)
    expect(before.vehicleSnapshot?.busNumber).toBe(`DR-DEL-${stamp}`)

    const created = await createDeletionRequest(
      db,
      'vehicle',
      v.id,
      'Unit sold and removed from fleet',
      ACTOR,
    )
    createdRequestIds.push(created.id)

    const { request } = await approveDeletionRequest(db, created.id, ACTOR, 'Confirmed with fleet manager')
    expect(request.status).toBe('approved')

    await expect(getVehicle(db, v.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })

    const after = await getInvoice(db, inv.id)
    expect(after.vehicleId).toBeNull()
    expect(after.vehicleSnapshot?.busNumber).toBe(`DR-DEL-${stamp}`)
    expect(after.vehicleSnapshot?.make).toBe('Kenworth')
    expect(after.customerSnapshot.displayName).toContain(`DelReq-${stamp}`)
  })

  it('approves draft invoice deletion and hard-deletes the invoice', async () => {
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

    await expect(getInvoice(db, draftInvoice.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const invIdx = createdInvoiceIds.indexOf(draftInvoice.id)
    if (invIdx >= 0) createdInvoiceIds.splice(invIdx, 1)
  })

  it('restores service log status when a converted invoice is deleted', async () => {
    const log = await createServiceLog(db, {
      customerId: customer.id,
      vehicleId: vehicle.id,
      workType: 'repair',
      serviceDate: '2026-07-08',
      complaint: 'Converted then deleted invoice',
    }, ACTOR)
    await transitionServiceLog(db, log.id, 'ready_for_review')
    await transitionServiceLog(db, log.id, 'in_review')
    const { invoice } = await convertServiceLogToInvoice(db, log.id, ACTOR)

    const delReq = await createDeletionRequest(
      db,
      'invoice',
      invoice.id,
      'Wrong conversion — recreate from log',
      ACTOR,
    )
    createdRequestIds.push(delReq.id)

    await approveDeletionRequest(db, delReq.id, ACTOR)

    const restored = await getServiceLog(db, log.id)
    expect(restored.status).toBe('ready_for_review')
    expect(restored.invoiceId).toBeNull()
    expect(restored.statusReason).toBe(INVOICE_LINK_RELEASED_REASON)
  })

  it('approves service log deletion and hard-deletes the log', async () => {
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
    await expect(getServiceLog(db, serviceLog.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('hard-deletes a customer while invoices keep full customer and vehicle snapshots', async () => {
    const keepCustomer = await createCustomer(db, {
      displayName: `DelKeep-${stamp}`,
      accountKind: 'fleet',
      email: 'delkeep@example.com',
      phone: '555-0100',
      paymentTerms: 'net_30',
    }, ACTOR)
    const keepVehicle = await createVehicle(db, {
      customerId: keepCustomer.id,
      unitType: 'truck',
      busNumber: `DK-${stamp}`,
      vin: '1FUJGHDV8CLBP0001',
      make: 'Peterbilt',
      model: '579',
      year: 2020,
    }, ACTOR)
    const keepInvoice = await createInvoice(db, {
      customerId: keepCustomer.id,
      vehicleId: keepVehicle.id,
      invoiceDate: '2026-07-03',
      dueDate: '2026-08-03',
    }, ACTOR)
    createdInvoiceIds.push(keepInvoice.id)
    await addInvoiceLineItem(db, keepInvoice.id, {
      description: 'Brake inspection',
      quantity: '1',
      unitPrice: '150.00',
      lineType: 'labor',
      taxable: true,
    }, ACTOR)

    const before = await getInvoice(db, keepInvoice.id)
    expect(before.customerSnapshot.displayName).toBe(`DelKeep-${stamp}`)
    expect(before.customerSnapshot.email).toBe('delkeep@example.com')
    expect(before.vehicleSnapshot?.busNumber).toBe(`DK-${stamp}`)
    expect(before.vehicleSnapshot?.vin).toBe('1FUJGHDV8CLBP0001')
    expect(before.vehicleSnapshot?.make).toBe('Peterbilt')

    const custReq = await createDeletionRequest(
      db,
      'customer',
      keepCustomer.id,
      'Fleet account closed — keep billing history',
      ACTOR,
    )
    createdRequestIds.push(custReq.id)
    await approveDeletionRequest(db, custReq.id, ACTOR)

    await expect(getCustomer(db, keepCustomer.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(getVehicle(db, keepVehicle.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })

    const after = await getInvoice(db, keepInvoice.id)
    expect(after.id).toBe(keepInvoice.id)
    expect(after.status).toBe(before.status)
    expect(after.customerId).toBeNull()
    expect(after.vehicleId).toBeNull()
    expect(after.customerSnapshot.displayName).toBe(`DelKeep-${stamp}`)
    expect(after.customerSnapshot.email).toBe('delkeep@example.com')
    expect(after.vehicleSnapshot?.busNumber).toBe(`DK-${stamp}`)
    expect(after.vehicleSnapshot?.vin).toBe('1FUJGHDV8CLBP0001')
    expect(after.vehicleSnapshot?.make).toBe('Peterbilt')

    await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, keepInvoice.id))
    await db.delete(invoices).where(eq(invoices.id, keepInvoice.id))
    const invIdx = createdInvoiceIds.indexOf(keepInvoice.id)
    if (invIdx >= 0) createdInvoiceIds.splice(invIdx, 1)
  })

  it('approves conversation deletion and hard-deletes the thread', async () => {
    const conv = await createOrGetDmConversation(db, ACTOR, ACTOR_B)
    createdConversationIds.push(conv.id)
    await sendMessage(db, conv.id, ACTOR, 'Thread scheduled for deletion')

    const label = await getConversationDeletionLabel(db, conv.id)
    expect(label).toMatch(/^DM:/)

    const created = await createDeletionRequest(
      db,
      'conversation',
      conv.id,
      'Spam thread no longer needed',
      ACTOR,
    )
    createdRequestIds.push(created.id)
    expect(created.entityType).toBe('conversation')
    expect(created.entityLabel).toBe(label)

    const { request } = await approveDeletionRequest(db, created.id, ACTOR, 'Approved cleanup')
    expect(request.status).toBe('approved')

    const [gone] = await db.select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, conv.id))
    expect(gone).toBeUndefined()

    const convIdx = createdConversationIds.indexOf(conv.id)
    if (convIdx >= 0) createdConversationIds.splice(convIdx, 1)
  })

  it('tombstones deleted email threads and suppresses future replies', async () => {
    const rootMessageId = `<deleted-${stamp}@example.com>`
    const replyMessageId = `<deleted-reply-${stamp}@example.com>`
    createdSuppressionIds.push(rootMessageId, replyMessageId)

    const [conversation] = await db.insert(conversations).values({ type: 'email' }).returning()
    createdConversationIds.push(conversation!.id)
    await db.insert(emailThreads).values({
      conversationId: conversation!.id,
      counterpartEmail: 'deleted-thread@example.com',
      subject: 'Thread that must stay deleted',
      rootMessageId,
    })
    const [message] = await db.insert(messages).values({
      conversationId: conversation!.id,
      senderUserId: null,
      body: 'Please delete this email thread',
    }).returning()
    await db.insert(emailMessageMeta).values({
      messageId: message!.id,
      direction: 'inbound',
      internetMessageId: rootMessageId,
      fromAddress: 'deleted-thread@example.com',
      toAddresses: ['accounting@example.com'],
      ccAddresses: [],
    })

    const created = await createDeletionRequest(
      db,
      'conversation',
      conversation!.id,
      'Delete this email thread permanently',
      ACTOR,
    )
    createdRequestIds.push(created.id)
    await approveDeletionRequest(db, created.id, ACTOR, 'Confirmed permanent deletion')

    const [tombstone] = await db.select()
      .from(emailIngestSuppressions)
      .where(eq(emailIngestSuppressions.internetMessageId, rootMessageId))
    expect(tombstone?.sourceConversationId).toBe(conversation!.id)
    expect(tombstone?.deletedBy).toBe(ACTOR)

    await expect(suppressesInboundEmail(db, {
      internetMessageId: replyMessageId,
      inReplyTo: rootMessageId,
    })).resolves.toBe(true)

    const [propagated] = await db.select()
      .from(emailIngestSuppressions)
      .where(eq(emailIngestSuppressions.internetMessageId, replyMessageId))
    expect(propagated?.sourceConversationId).toBe(conversation!.id)

    const convIdx = createdConversationIds.indexOf(conversation!.id)
    if (convIdx >= 0) createdConversationIds.splice(convIdx, 1)
  })
})
