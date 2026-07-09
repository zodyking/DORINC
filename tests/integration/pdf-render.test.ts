// Integration smoke test for pdf-worker HTML → PDF → app_files pipeline (P1-28).
import { config } from 'dotenv'
import { eq, notLike } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
})

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

const SMOKE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>body{font-family:sans-serif;padding:24px;}</style></head>
<body><h1>DORINC PDF Smoke Test</h1><p>Generated ${stamp}</p></body></html>`

describe('P1-28 pdf render pipeline', () => {
  it('renders HTML to PDF bytes stored in app_files', async () => {
    if (!chromiumAvailable) {
      console.warn('[pdf-render.test] Skipping — Playwright Chromium not installed (run: npx playwright install chromium)')
      return
    }

    const job = await enqueuePdfRenderJob(db, {
      entityType: 'invoice',
      entityId: owner.id,
      htmlContent: SMOKE_HTML,
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
