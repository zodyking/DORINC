// P4-04 — load smoke: MAX_UPLOAD_MB boundary + concurrent pdf-worker jobs.
import { createHash } from 'node:crypto'
import { config } from 'dotenv'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { waitForPdfJobDone } from '../helpers/pdf-render'
import { createCustomer } from '../../server/services/customers.service'
import {
  FilesServiceError,
  maxUploadBytes,
  uploadFile,
} from '../../server/services/files.service'
import { enqueuePdfRenderJob } from '../../server/services/pdf-render.service'
import {
  buildDocumentPdfRenderPayload,
  buildInvoicePdfData,
  serializePdfRenderPayload,
} from '../../shared/document-pdf-payload'
import { appFiles } from '../../server/db/schema/files'
import { pdfRenderJobs } from '../../server/db/schema/pdf-render-jobs'
import { users } from '../../server/db/schema/auth'
import { customers } from '../../server/db/schema/customers'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const PDF_JOB_COUNT = Number(process.env.LOAD_SMOKE_PDF_JOBS ?? 5)

const [stableUser] = await db.select({ id: users.id }).from(users).limit(1)
const CREATOR = stableUser!.id

const owner = await createCustomer(db, {
  displayName: `LoadSmoke-${stamp} Co`,
  accountKind: 'individual',
}, CREATOR)

const PNG_HEADER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

function pngBuffer(sizeBytes: number): Buffer {
  const buf = Buffer.alloc(sizeBytes)
  PNG_HEADER.copy(buf, 0, 0, Math.min(PNG_HEADER.length, sizeBytes))
  return buf
}

afterAll(async () => {
  await db.delete(pdfRenderJobs).where(eq(pdfRenderJobs.entityId, owner.id))
  await db.delete(appFiles).where(eq(appFiles.ownerEntityId, owner.id))
  await db.delete(customers).where(eq(customers.id, owner.id))
  await pool.end()
})

describe('P4-04 load smoke — upload boundary', () => {
  it(`accepts a file at MAX_UPLOAD_MB (${Math.floor(maxUploadBytes() / 1024 / 1024)} MB) boundary`, async () => {
    const limit = maxUploadBytes()
    const atLimit = pngBuffer(limit)
    const file = await uploadFile(db, {
      ownerEntityType: 'customer',
      ownerEntityId: owner.id,
      fileKind: 'attachment',
      originalFilename: `boundary-at-${stamp}.png`,
      mimeType: 'image/png',
      data: atLimit,
    }, CREATOR)
    expect(file.fileSizeBytes).toBe(limit)
    expect(file.sha256Hash).toBe(createHash('sha256').update(atLimit).digest('hex'))
  })

  it('rejects a file one byte over MAX_UPLOAD_MB', async () => {
    const over = pngBuffer(maxUploadBytes() + 1)
    await expect(uploadFile(db, {
      ownerEntityType: 'customer',
      ownerEntityId: owner.id,
      fileKind: 'attachment',
      originalFilename: `boundary-over-${stamp}.png`,
      mimeType: 'image/png',
      data: over,
    }, CREATOR)).rejects.toThrow(FilesServiceError)
  })
})

describe('P4-04 load smoke — pdf-worker concurrency', () => {
  it(`renders ${PDF_JOB_COUNT} queued PDF jobs`, async () => {
    const started = Date.now()

    const jobs = await Promise.all(
      Array.from({ length: PDF_JOB_COUNT }, (_, i) => {
        const data = buildInvoicePdfData({
          invoiceNumberFormatted: `LOAD-${stamp}-${i + 1}`,
          invoiceDate: '2026-07-08',
          paymentTerms: 'net_30',
          status: 'sent',
          lineItems: [{
            description: `Load smoke line ${i + 1}`,
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
        return enqueuePdfRenderJob(db, {
          entityType: 'invoice',
          entityId: owner.id,
          renderPayload: serializePdfRenderPayload(payload),
          originalFilename: `load-smoke-${stamp}-${i + 1}.pdf`,
          createdBy: CREATOR,
        })
      }),
    )

    await Promise.all(jobs.map(job => waitForPdfJobDone(pool, job.id, 180_000)))

    const elapsedMs = Date.now() - started
    const perJobMs = Math.round(elapsedMs / PDF_JOB_COUNT)

    for (const job of jobs) {
      const { rows } = await pool.query<{ status: string, output_file_id: string | null }>(
        'SELECT status, output_file_id FROM pdf_render_jobs WHERE id = $1',
        [job.id],
      )
      expect(rows[0]?.status).toBe('done')
      expect(rows[0]?.output_file_id).toBeTruthy()
    }

    console.info(`[load-smoke] pdf-worker: ${PDF_JOB_COUNT} jobs in ${elapsedMs}ms (~${perJobMs}ms/job)`)
    expect(elapsedMs).toBeLessThan(180_000)
  })
})
