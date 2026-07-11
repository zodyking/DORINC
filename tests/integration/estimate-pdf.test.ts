// Integration tests for estimate PDF generate + download API (P3-02).
import { config } from 'dotenv'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { waitForPdfJobDone } from '../helpers/pdf-render'
import { createCustomer } from '../../server/services/customers.service'
import {
  addEstimateLineItem,
  createEstimate,
  sendEstimate,
} from '../../server/services/estimates.service'
import {
  generateEstimatePdf,
  getEstimatePdfDownload,
  getEstimatePdfRecord,
} from '../../server/services/estimate-pdf.service'
import { seedInvoiceTemplates } from '../../server/db/seed-invoice-templates'
import { appFiles } from '../../server/db/schema/files'
import { estimateFiles, estimateLineItems, estimates } from '../../server/db/schema/estimates'
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
  displayName: `EstPdfTest-${stamp} Co`,
  accountKind: 'individual',
  email: `estpdf-${stamp}@example.com`,
  phone: '555-0101',
}, ACTOR)

afterAll(async () => {
  const estimateRows = await db.select({ id: estimates.id }).from(estimates)
    .where(eq(estimates.customerId, customer.id))
  const estimateIds = estimateRows.map(r => r.id)

  if (estimateIds.length) {
    await db.delete(estimateFiles).where(inArray(estimateFiles.estimateId, estimateIds))
    await pool.query(
      `DELETE FROM pdf_render_jobs WHERE entity_type = 'estimate' AND entity_id = ANY($1::uuid[])`,
      [estimateIds],
    )
    await db.delete(appFiles).where(inArray(appFiles.ownerEntityId, estimateIds))
    await db.delete(estimateLineItems).where(inArray(estimateLineItems.estimateId, estimateIds))
    await db.delete(estimates).where(inArray(estimates.id, estimateIds))
  }

  await db.delete(customers).where(eq(customers.id, customer.id))
  await pool.end()
})

async function sentEstimate() {
  const estimate = await createEstimate(db, {
    customerId: customer.id,
    estimateDate: '2026-07-08',
    creationSource: 'customer',
  }, ACTOR)

  await addEstimateLineItem(db, estimate.id, {
    lineType: 'labor',
    description: 'Transmission diagnostic',
    quantity: '2',
    unitPrice: '125.00',
    sortOrder: 1,
  }, ACTOR)

  await sendEstimate(db, estimate.id, ACTOR)
  return estimate.id
}

describe('P3-02 estimate PDF generate + download', () => {
  it('rejects PDF generation for draft estimates', async () => {
    const draft = await createEstimate(db, {
      customerId: customer.id,
      estimateDate: '2026-07-08',
      creationSource: 'customer',
    }, ACTOR)

    await expect(generateEstimatePdf(db, draft.id, ACTOR))
      .rejects.toMatchObject({ code: 'NOT_FINALIZED' })
  })

  it('enqueues render job, stores immutable estimate_files, and downloads PDF', async () => {
    if (!process.env.PDF_RENDER_URL?.trim()) {
      console.warn('[estimate-pdf.test] Skipping — PDF_RENDER_URL not set (laravel-pdf service required)')
      return
    }

    const estimateId = await sentEstimate()

    const first = await generateEstimatePdf(db, estimateId, ACTOR)
    expect(first.alreadyExists).toBe(false)
    expect(first.job?.status).toBe('queued')
    expect(first.templateVersionId).toBeTruthy()

    await waitForPdfJobDone(pool, first.job!.id)

    const record = await getEstimatePdfRecord(db, estimateId)
    expect(record).toBeTruthy()
    expect(record!.templateVersionId).toBe(first.templateVersionId)
    expect(record!.sha256Hash).toMatch(/^[a-f0-9]{64}$/)

    const { record: downloadRecord, file } = await getEstimatePdfDownload(db, estimateId)
    expect(downloadRecord.sha256Hash).toBe(file.sha256Hash)
    expect(file.mimeType).toBe('application/pdf')
    expect(file.fileSizeBytes).toBeGreaterThan(500)

    const bytes = file.binaryData as Buffer
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')

    const second = await generateEstimatePdf(db, estimateId, ACTOR)
    expect(second.alreadyExists).toBe(true)
    expect(second.estimateFile?.id).toBe(record!.id)
    expect(second.job).toBeNull()
  }, 60_000)

  it('returns NO_PDF when download requested before generation', async () => {
    const estimate = await createEstimate(db, {
      customerId: customer.id,
      estimateDate: '2026-07-08',
      creationSource: 'customer',
    }, ACTOR)
    await sendEstimate(db, estimate.id, ACTOR)

    await expect(getEstimatePdfDownload(db, estimate.id))
      .rejects.toMatchObject({ code: 'NO_PDF' })
  })
})
