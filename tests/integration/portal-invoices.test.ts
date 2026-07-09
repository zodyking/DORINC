// Integration tests for portal invoices + PDF scoping (P2-05).
import { config } from 'dotenv'
import { inArray, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { waitForPdfJobDone } from '../helpers/pdf-render'
import { users } from '../../server/db/schema/auth'
import { appFiles } from '../../server/db/schema/files'
import { customers } from '../../server/db/schema/customers'
import { invoiceFiles, invoiceLineItems, invoices } from '../../server/db/schema/invoices'
import { vehicles } from '../../server/db/schema/vehicles'
import { seedInvoiceTemplates } from '../../server/db/seed-invoice-templates'
import {
  addInvoiceLineItem,
  approveInvoice,
  createInvoice,
  sendInvoice,
} from '../../server/services/invoices.service'
import { createCustomer } from '../../server/services/customers.service'
import { generateInvoicePdf } from '../../server/services/invoice-pdf.service'
import {
  createPortalUser,
  getPortalInvoiceDetail,
  getPortalInvoicePdfDownload,
  listPortalInvoices,
} from '../../server/services/portal.service'
import { createVehicle } from '../../server/services/vehicles.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const password = 'portal-inv-pdf-test-123'
let chromiumAvailable = false

beforeAll(async () => {
  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true })
    await browser.close()
    chromiumAvailable = true
  }
  catch {
    chromiumAvailable = false
  }
  await seedInvoiceTemplates(db)
})

const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const ACTOR = anyUser!.id

const customerA = await createCustomer(db, {
  displayName: `PortalInvA-${stamp}`,
  accountKind: 'fleet',
  paymentTerms: 'net_30',
}, ACTOR)

const customerB = await createCustomer(db, {
  displayName: `PortalInvB-${stamp}`,
  accountKind: 'fleet',
  paymentTerms: 'net_30',
}, ACTOR)

const vehicleA = await createVehicle(db, {
  customerId: customerA.id,
  unitType: 'truck',
  busNumber: `PI-${stamp}`,
  make: 'Freightliner',
  model: 'Cascadia',
  year: 2019,
}, ACTOR)

const { hashPassword } = await import('../../server/auth/password')
const passwordHash = await hashPassword(password)

await createPortalUser(db, {
  customerId: customerA.id,
  name: 'Portal Inv A',
  email: `portal-inv-a-${stamp}@test.dorinc.local`,
  passwordHash,
})

await createPortalUser(db, {
  customerId: customerB.id,
  name: 'Portal Inv B',
  email: `portal-inv-b-${stamp}@test.dorinc.local`,
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
    await db.delete(invoiceFiles).where(inArray(invoiceFiles.invoiceId, invoiceIds))
    await pool.query(
      `DELETE FROM pdf_render_jobs WHERE entity_type = 'invoice' AND entity_id = ANY($1::uuid[])`,
      [invoiceIds],
    )
    await db.delete(appFiles).where(inArray(appFiles.ownerEntityId, invoiceIds))
    await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, invoiceIds))
    await db.delete(invoices).where(inArray(invoices.id, invoiceIds))
  }
  await db.delete(users).where(like(users.email, `portal-inv-%${stamp}@test.dorinc.local`))
  await db.delete(vehicles).where(inArray(vehicles.customerId, custIds))
  await db.delete(customers).where(inArray(customers.id, custIds))
  await pool.end()
})

describe('P2-05 portal invoices list + detail', () => {
  it('returns invoice detail with line items for own customer', async () => {
    const detail = await getPortalInvoiceDetail(db, customerA.id, invoiceAId)
    expect(detail.invoiceNumberFormatted).toMatch(/^INV-/)
    expect(detail.lineItems.length).toBeGreaterThan(0)
    expect(detail.lineItems[0]!.description).toBe('Diesel diagnostic')
  })

  it('returns NOT_FOUND when another customer requests invoice detail', async () => {
    await expect(getPortalInvoiceDetail(db, customerB.id, invoiceAId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('lists invoices only for scoped customer', async () => {
    const listA = await listPortalInvoices(db, customerA.id)
    const listB = await listPortalInvoices(db, customerB.id)
    expect(listA.some(i => i.id === invoiceAId)).toBe(true)
    expect(listB.some(i => i.id === invoiceAId)).toBe(false)
  })
})

describe('P2-05 portal invoice PDF download (IDOR)', () => {
  it('allows PDF download for own invoice when PDF exists', async () => {
    if (!chromiumAvailable) {
      console.warn('[portal-invoices.test] Skipping PDF download — Chromium not available')
      return
    }

    const generated = await generateInvoicePdf(db, invoiceAId, ACTOR)
    if (generated.job) {
      await waitForPdfJobDone(pool, generated.job.id)
    }

    const { file } = await getPortalInvoicePdfDownload(db, customerA.id, invoiceAId)
    expect(file.mimeType).toBe('application/pdf')
    expect((file.binaryData as Buffer).subarray(0, 5).toString('latin1')).toBe('%PDF-')
  }, 60_000)

  it('returns NOT_FOUND when another customer requests PDF (IDOR)', async () => {
    if (!chromiumAvailable) return

    const generated = await generateInvoicePdf(db, invoiceAId, ACTOR)
    if (generated.job) {
      await waitForPdfJobDone(pool, generated.job.id)
    }

    await expect(getPortalInvoicePdfDownload(db, customerB.id, invoiceAId))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  }, 60_000)

  it('returns NO_PDF when PDF not generated yet', async () => {
    const invoice = await createInvoice(db, {
      customerId: customerA.id,
      vehicleId: vehicleA.id,
      invoiceDate: '2026-07-09',
      creationSource: 'blank',
    }, ACTOR)
    await approveInvoice(db, invoice.id, ACTOR)
    await sendInvoice(db, invoice.id, ACTOR)

    await expect(getPortalInvoicePdfDownload(db, customerA.id, invoice.id))
      .rejects.toMatchObject({ code: 'NO_PDF' })
  })
})
