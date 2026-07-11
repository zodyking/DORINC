// Integration tests for invoice PDF generate + download API (P1-29).
import { config } from 'dotenv'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { waitForPdfJobDone } from '../helpers/pdf-render'
import { createCustomer } from '../../server/services/customers.service'
import {
  addInvoiceLineItem,
  approveInvoice,
  createInvoice,
} from '../../server/services/invoices.service'
import {
  generateInvoicePdf,
  getInvoicePdfDownload,
  getInvoicePdfRecord,
} from '../../server/services/invoice-pdf.service'
import { seedInvoiceTemplates } from '../../server/db/seed-invoice-templates'
import { appFiles } from '../../server/db/schema/files'
import { invoiceFiles, invoiceLineItems, invoices } from '../../server/db/schema/invoices'
import { customers } from '../../server/db/schema/customers'
import { users } from '../../server/db/schema/auth'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()

beforeAll(async () => {
  await seedInvoiceTemplates(db)
})

const [stableUser] = await db.select({ id: users.id }).from(users).limit(1)
const ACTOR = stableUser!.id

const customer = await createCustomer(db, {
  displayName: `InvPdfTest-${stamp} Co`,
  accountKind: 'individual',
  email: `invpdf-${stamp}@example.com`,
  phone: '555-0100',
}, ACTOR)

afterAll(async () => {
  const invoiceRows = await db.select({ id: invoices.id }).from(invoices)
    .where(eq(invoices.customerId, customer.id))
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

  await db.delete(customers).where(eq(customers.id, customer.id))
  await pool.end()
})

async function approvedInvoice() {
  const invoice = await createInvoice(db, {
    customerId: customer.id,
    invoiceDate: '2026-07-08',
    creationSource: 'customer',
  }, ACTOR)

  await addInvoiceLineItem(db, invoice.id, {
    lineType: 'labor',
    description: 'DPF diagnostic and regen',
    quantity: '1.5',
    unitPrice: '145.00',
    sortOrder: 1,
  }, ACTOR)

  await approveInvoice(db, invoice.id, ACTOR)
  return invoice.id
}

describe('P1-29 invoice PDF generate + download', () => {
  it('rejects PDF generation for draft invoices', async () => {
    const draft = await createInvoice(db, {
      customerId: customer.id,
      invoiceDate: '2026-07-08',
      creationSource: 'customer',
    }, ACTOR)

    await expect(generateInvoicePdf(db, draft.id, ACTOR))
      .rejects.toMatchObject({ code: 'NOT_FINALIZED' })
  })

  it('enqueues render job, stores immutable invoice_files, and downloads PDF', async () => {
    if (!process.env.PDF_RENDER_URL?.trim()) {
      console.warn('[invoice-pdf.test] Skipping — PDF_RENDER_URL not set (laravel-pdf service required)')
      return
    }

    const invoiceId = await approvedInvoice()

    const first = await generateInvoicePdf(db, invoiceId, ACTOR)
    expect(first.alreadyExists).toBe(false)
    expect(first.job?.status).toBe('queued')
    expect(first.templateVersionId).toBeTruthy()

    await waitForPdfJobDone(pool, first.job!.id)

    const record = await getInvoicePdfRecord(db, invoiceId)
    expect(record).toBeTruthy()
    expect(record!.templateVersionId).toBe(first.templateVersionId)
    expect(record!.sha256Hash).toMatch(/^[a-f0-9]{64}$/)

    const { record: downloadRecord, file } = await getInvoicePdfDownload(db, invoiceId)
    expect(downloadRecord.sha256Hash).toBe(file.sha256Hash)
    expect(file.mimeType).toBe('application/pdf')
    expect(file.fileSizeBytes).toBeGreaterThan(500)

    const bytes = file.binaryData as Buffer
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')

    const second = await generateInvoicePdf(db, invoiceId, ACTOR)
    expect(second.alreadyExists).toBe(true)
    expect(second.invoiceFile?.id).toBe(record!.id)
    expect(second.job).toBeNull()
  }, 60_000)

  it('returns NO_PDF when download requested before generation', async () => {
    const invoice = await createInvoice(db, {
      customerId: customer.id,
      invoiceDate: '2026-07-08',
      creationSource: 'customer',
    }, ACTOR)
    await approveInvoice(db, invoice.id, ACTOR)

    await expect(getInvoicePdfDownload(db, invoice.id))
      .rejects.toMatchObject({ code: 'NO_PDF' })
  })
})
