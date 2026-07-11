// Integration smoke test for pdf-worker Blade payload → PDF → app_files pipeline (P1-28).
import { config } from 'dotenv'
import { eq, notLike } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import {
  buildDocumentPdfRenderPayload,
  buildInvoicePdfData,
  serializePdfRenderPayload,
} from '../../shared/document-pdf-payload'
import { waitForPdfJobDone } from '../helpers/pdf-render'
import { createCustomer } from '../../server/services/customers.service'
import { enqueuePdfRenderJob, getPdfRenderJob } from '../../server/services/pdf-render.service'
import { getFileWithData } from '../../server/services/files.service'
import { appFiles } from '../../server/db/schema/files'
import { users } from '../../server/db/schema/auth'
import { customers } from '../../server/db/schema/customers'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()

const [stableUser] = await db.select({ id: users.id }).from(users)
  .where(notLike(users.email, 'authtest-%'))
  .limit(1)
const CREATOR = stableUser!.id

const owner = await createCustomer(db, {
  displayName: `PdfRenderTest-${stamp} Co`,
  accountKind: 'individual',
}, CREATOR)

afterAll(async () => {
  await pool.query(
    `DELETE FROM pdf_render_jobs WHERE entity_id = $1`,
    [owner.id],
  )
  await db.delete(appFiles).where(eq(appFiles.ownerEntityId, owner.id))
  await db.delete(customers).where(eq(customers.id, owner.id))
  await pool.end()
})

describe('P1-28 pdf render pipeline', () => {
  it('renders Blade payload to PDF bytes stored in app_files', async () => {
    if (!process.env.PDF_RENDER_URL?.trim()) {
      console.warn('[pdf-render.test] Skipping — PDF_RENDER_URL not set (laravel-pdf service required)')
      return
    }

    const data = buildInvoicePdfData({
      invoiceNumberFormatted: `INV-SMOKE-${stamp}`,
      invoiceDate: '2026-07-08',
      paymentTerms: 'due_on_receipt',
      status: 'approved',
      complaint: `Smoke test ${stamp}`,
      customerName: owner.displayName,
      customerSnapshot: {
        displayName: owner.displayName,
        phone: '555-0100',
        email: `smoke-${stamp}@example.com`,
      },
      vehicleSnapshot: null,
      lineItems: [{
        description: 'PDF pipeline smoke test',
        lineType: 'labor',
        quantity: '1',
        unitPrice: '25.00',
        lineAmount: '25.00',
      }],
      feesAmount: '0',
      discountAmount: '0',
      taxAmount: '0',
      total: '25.00',
      balanceDue: '25.00',
    })
    const payload = buildDocumentPdfRenderPayload(data, { paper: 'letter', marginInches: 0.5 })

    const job = await enqueuePdfRenderJob(db, {
      entityType: 'invoice',
      entityId: owner.id,
      renderPayload: serializePdfRenderPayload(payload),
      originalFilename: `smoke-${stamp}.pdf`,
      createdBy: CREATOR,
    })
    expect(job.status).toBe('queued')

    await waitForPdfJobDone(pool, job.id)

    const finished = await getPdfRenderJob(db, job.id)
    expect(finished?.status).toBe('done')
    expect(finished?.outputFileId).toBeTruthy()

    const file = await getFileWithData(db, finished!.outputFileId!)
    expect(file.mimeType).toBe('application/pdf')
    expect(file.fileKind).toBe('pdf')
    expect(file.fileSizeBytes).toBeGreaterThan(500)
    expect(file.sha256Hash).toMatch(/^[a-f0-9]{64}$/)

    const raw = await db.select({ binaryData: appFiles.binaryData }).from(appFiles)
      .where(eq(appFiles.id, file.id))
    const bytes = raw[0]!.binaryData as Buffer
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })
})
