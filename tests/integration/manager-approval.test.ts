// Integration tests for manager invoice approval workflow (P3-13).
import { config } from 'dotenv'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { createCustomer } from '../../server/services/customers.service'
import {
  addInvoiceLineItem,
  approveInvoice,
  canManagerApproveInvoices,
  createInvoice,
  sendInvoice,
} from '../../server/services/invoices.service'
import { invoiceLineItems, invoices } from '../../server/db/schema/invoices'
import { customers } from '../../server/db/schema/customers'
import { users } from '../../server/db/schema/auth'
import { sendAndDeliverInvoice } from '../helpers/invoice-send'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const ACTOR = anyUser!.id

const customer = await createCustomer(db, {
  displayName: `MgrAppr-${stamp} Fleet`,
  accountKind: 'fleet',
}, ACTOR)

afterAll(async () => {
  const invoiceRows = await db.select({ id: invoices.id }).from(invoices)
    .where(eq(invoices.customerId, customer.id))
  const invoiceIds = invoiceRows.map(r => r.id)
  if (invoiceIds.length) {
    await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, invoiceIds))
    await db.delete(invoices).where(inArray(invoices.id, invoiceIds))
  }
  await db.delete(customers).where(eq(customers.id, customer.id))
  await pool.end()
})

async function highValueDraft() {
  const invoice = await createInvoice(db, {
    customerId: customer.id,
    invoiceDate: '2026-07-08',
    creationSource: 'blank',
  }, ACTOR)

  await addInvoiceLineItem(db, invoice.id, {
    lineType: 'labor',
    description: 'Major engine overhaul',
    quantity: '1',
    unitPrice: '6000.00',
    sortOrder: 1,
  }, ACTOR)

  return invoice
}

describe('P3-13 manager approval workflow', () => {
  it('routes high-value accountant approvals to pending_manager_approval', async () => {
    const draft = await highValueDraft()
    const { invoice } = await approveInvoice(db, draft.id, ACTOR, 'accountant')
    expect(invoice.status).toBe('pending_manager_approval')
    expect(invoice.submittedForApprovalAt).toBeTruthy()
  })

  it('lets managers send pending_manager_approval invoices', async () => {
    const draft = await highValueDraft()
    await approveInvoice(db, draft.id, ACTOR, 'accountant')
    const sent = await sendAndDeliverInvoice(db, pool, draft.id, ACTOR, 'manager')
    expect(sent.status).toBe('sent')
    expect(sent.approvedAt).toBeTruthy()
  })

  it('lets managers send high-value drafts directly', async () => {
    const draft = await highValueDraft()
    const sent = await sendAndDeliverInvoice(db, pool, draft.id, ACTOR, 'manager')
    expect(sent.status).toBe('sent')
  })

  it('identifies manager approval account types', () => {
    expect(canManagerApproveInvoices('manager')).toBe(true)
    expect(canManagerApproveInvoices('admin')).toBe(true)
    expect(canManagerApproveInvoices('accountant')).toBe(false)
  })
})
