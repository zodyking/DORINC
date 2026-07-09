// Integration tests for portal auth + customer_id scoping (P2-03).
import { config } from 'dotenv'
import { eq, inArray, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { login } from '../../server/auth/auth.service'
import { hashPassword } from '../../server/auth/password'
import { users } from '../../server/db/schema/auth'
import { customers } from '../../server/db/schema/customers'
import { invoiceLineItems, invoices } from '../../server/db/schema/invoices'
import { vehicles } from '../../server/db/schema/vehicles'
import {
  addInvoiceLineItem,
  approveInvoice,
  createInvoice,
  sendInvoice,
} from '../../server/services/invoices.service'
import { createCustomer } from '../../server/services/customers.service'
import {
  createPortalUser,
  getPortalDashboard,
  getPortalInvoice,
  listPortalInvoices,
  PortalServiceError,
} from '../../server/services/portal.service'
import { createVehicle } from '../../server/services/vehicles.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const password = 'portal-test-password-123'

const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const ACTOR = anyUser!.id

const customerA = await createCustomer(db, {
  displayName: `PortalA-${stamp} Hollis Logistics`,
  accountKind: 'fleet',
  paymentTerms: 'net_30',
}, ACTOR)

const customerB = await createCustomer(db, {
  displayName: `PortalB-${stamp} Marren Farms`,
  accountKind: 'fleet',
  paymentTerms: 'net_30',
}, ACTOR)

const vehicleA = await createVehicle(db, {
  customerId: customerA.id,
  unitType: 'truck',
  busNumber: `HL-${stamp}`,
  make: 'Freightliner',
  model: 'Cascadia',
  year: 2019,
}, ACTOR)

const passwordHash = await hashPassword(password)

const portalUserA = await createPortalUser(db, {
  customerId: customerA.id,
  name: 'Marcus Hollis',
  email: `portal-a-${stamp}@test.dorinc.local`,
  passwordHash,
})

await createPortalUser(db, {
  customerId: customerB.id,
  name: 'Ellen Marren',
  email: `portal-b-${stamp}@test.dorinc.local`,
  passwordHash,
})

let invoiceAId = ''

async function seedSentInvoice() {
  const invoice = await createInvoice(db, {
    customerId: customerA.id,
    vehicleId: vehicleA.id,
    invoiceDate: '2026-07-03',
    creationSource: 'blank',
  }, ACTOR)

  await addInvoiceLineItem(db, invoice.id, {
    lineType: 'labor',
    description: 'Diesel diagnostic',
    quantity: '2',
    unitPrice: '145.00',
    sortOrder: 1,
  }, ACTOR)

  await approveInvoice(db, invoice.id, ACTOR)
  await sendInvoice(db, invoice.id, ACTOR)
  invoiceAId = invoice.id
  return invoice.id
}

invoiceAId = await seedSentInvoice()

afterAll(async () => {
  const custIds = [customerA.id, customerB.id]
  const invoiceRows = await db.select({ id: invoices.id }).from(invoices)
    .where(inArray(invoices.customerId, custIds))
  const invoiceIds = invoiceRows.map(r => r.id)
  if (invoiceIds.length) {
    await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, invoiceIds))
    await db.delete(invoices).where(inArray(invoices.id, invoiceIds))
  }
  await db.delete(users).where(like(users.email, `portal-%${stamp}@test.dorinc.local`))
  await db.delete(vehicles).where(inArray(vehicles.customerId, custIds))
  await db.delete(customers).where(inArray(customers.id, custIds))
  await pool.end()
})

describe('P2-03 portal customer login', () => {
  it('logs in a portal user when portal is enabled', async () => {
    const result = await login(db, portalUserA.email, password, { portal: 'customer' })
    expect(result.accountTypeKey).toBe('customer')
    expect(result.user.customerId).toBe(customerA.id)
  })

  it('blocks login when portal is disabled', async () => {
    await db.update(customers).set({ portalEnabled: false }).where(eq(customers.id, customerA.id))
    await expect(login(db, portalUserA.email, password, { portal: 'customer' })).rejects.toThrow('PORTAL_DISABLED')
    await db.update(customers).set({ portalEnabled: true }).where(eq(customers.id, customerA.id))
  })

  it('blocks login when customer link is missing', async () => {
    await db.update(users).set({ customerId: null }).where(eq(users.id, portalUserA.id))
    await expect(login(db, portalUserA.email, password, { portal: 'customer' })).rejects.toThrow('PORTAL_NOT_LINKED')
    await db.update(users).set({ customerId: customerA.id }).where(eq(users.id, portalUserA.id))
  })

  it('blocks login when temporary password expired', async () => {
    await db.update(users)
      .set({ tempPasswordExpiresAt: new Date(Date.now() - 60_000) })
      .where(eq(users.id, portalUserA.id))
    await expect(login(db, portalUserA.email, password, { portal: 'customer' })).rejects.toThrow('TEMP_PASSWORD_EXPIRED')
    await db.update(users)
      .set({ tempPasswordExpiresAt: null })
      .where(eq(users.id, portalUserA.id))
  })

  it('blocks customer login via staff portal', async () => {
    await expect(
      login(db, portalUserA.email, password, { portal: 'staff' }),
    ).rejects.toThrow('WRONG_PORTAL')
  })
})

describe('P2-03 portal data scoping (IDOR)', () => {
  it('returns own invoice for matching customer_id', async () => {
    const inv = await getPortalInvoice(db, customerA.id, invoiceAId)
    expect(inv.invoiceNumberFormatted).toMatch(/^INV-/)
    expect(inv.status).toBe('sent')
  })

  it('returns NOT_FOUND when another customer requests the invoice', async () => {
    await expect(getPortalInvoice(db, customerB.id, invoiceAId)).rejects.toThrow(PortalServiceError)
    await expect(getPortalInvoice(db, customerB.id, invoiceAId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('lists invoices only for the scoped customer', async () => {
    const listA = await listPortalInvoices(db, customerA.id)
    const listB = await listPortalInvoices(db, customerB.id)
    expect(listA.some(i => i.id === invoiceAId)).toBe(true)
    expect(listB.some(i => i.id === invoiceAId)).toBe(false)
  })

  it('dashboard KPIs reflect only the scoped customer', async () => {
    const dashA = await getPortalDashboard(db, customerA.id, 'Marcus')
    const dashB = await getPortalDashboard(db, customerB.id, 'Ellen')
    expect(dashA.kpis.openInvoiceCount).toBeGreaterThan(0)
    expect(dashB.kpis.openInvoiceCount).toBe(0)
    expect(dashA.recentInvoices.length).toBeGreaterThan(0)
    expect(dashB.recentInvoices.length).toBe(0)
  })

  it('hides draft invoices from portal views', async () => {
    const draft = await createInvoice(db, {
      customerId: customerA.id,
      vehicleId: vehicleA.id,
      invoiceDate: '2026-07-08',
      creationSource: 'blank',
    }, ACTOR)

    const list = await listPortalInvoices(db, customerA.id)
    expect(list.some(i => i.id === draft.id)).toBe(false)

    await expect(getPortalInvoice(db, customerA.id, draft.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
