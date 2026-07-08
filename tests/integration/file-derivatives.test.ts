// Integration tests for the thumbnail/preview worker job (P1-14):
// enqueue on upload, sharp derivative generation, retry-safe job handling.
import { config } from 'dotenv'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import sharp from 'sharp'
import { afterAll, describe, expect, it } from 'vitest'
// @ts-expect-error plain-JS worker handler has no type declarations
import { generateDerivatives, processThumbnailJobs } from '../../server/workers/handlers/derivatives.mjs'
import { uploadFile } from '../../server/services/files.service'
import { enqueueJob, getJob } from '../../server/services/jobs.service'
import { appFiles } from '../../server/db/schema/files'
import { workerJobs } from '../../server/db/schema/jobs'
import { users } from '../../server/db/schema/auth'
import { customers } from '../../server/db/schema/customers'
import { createCustomer } from '../../server/services/customers.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()

const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const CREATOR = anyUser!.id

const owner = await createCustomer(db, {
  displayName: `DerivTest-${stamp} Co`,
  accountKind: 'individual',
}, CREATOR)

afterAll(async () => {
  // Remove queue rows for the files this test created (incl. the missing-id job)
  await pool.query(
    `DELETE FROM worker_jobs WHERE job_type = 'thumbnail_generate' AND (
       payload->>'fileId' IN (SELECT id::text FROM app_files WHERE owner_entity_id = $1)
       OR payload->>'fileId' = '00000000-0000-0000-0000-000000000000'
     )`,
    [owner.id],
  )
  await db.delete(appFiles).where(eq(appFiles.ownerEntityId, owner.id))
  await db.delete(customers).where(eq(customers.id, owner.id))
  await pool.end()
})

async function uploadTestImage(width = 2000, height = 1200) {
  const jpeg = await sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 90, b: 200 } },
  }).jpeg({ quality: 80 }).toBuffer()

  return uploadFile(db, {
    ownerEntityType: 'customer',
    ownerEntityId: owner.id,
    fileKind: 'original',
    originalFilename: `photo-${stamp}.jpg`,
    mimeType: 'image/jpeg',
    data: jpeg,
  }, CREATOR)
}

describe('P1-14 thumbnail + preview generation', () => {
  it('generates thumbnail + preview rows and backfills original dimensions', async () => {
    const original = await uploadTestImage()
    await generateDerivatives(pool, original.id)

    const derived = await db.select().from(appFiles)
      .where(eq(appFiles.sourceFileId, original.id))
    expect(derived.map(d => d.fileKind).sort()).toEqual(['preview', 'thumbnail'])

    const thumb = derived.find(d => d.fileKind === 'thumbnail')!
    expect(thumb.mimeType).toBe('image/webp')
    expect(Math.max(thumb.width!, thumb.height!)).toBeLessThanOrEqual(320)
    expect(thumb.fileSizeBytes).toBeGreaterThan(0)
    expect(thumb.sha256Hash).toMatch(/^[a-f0-9]{64}$/)

    const preview = derived.find(d => d.fileKind === 'preview')!
    expect(Math.max(preview.width!, preview.height!)).toBeLessThanOrEqual(1600)
    // Preview keeps aspect ratio
    expect(preview.width! / preview.height!).toBeCloseTo(2000 / 1200, 1)

    const [reloaded] = await db.select({ width: appFiles.width, height: appFiles.height })
      .from(appFiles).where(eq(appFiles.id, original.id))
    expect(reloaded!.width).toBe(2000)
    expect(reloaded!.height).toBe(1200)
  })

  it('is idempotent — re-running creates no duplicate derivatives', async () => {
    const original = await uploadTestImage(800, 600)
    await generateDerivatives(pool, original.id)
    await generateDerivatives(pool, original.id)

    const derived = await db.select().from(appFiles).where(eq(appFiles.sourceFileId, original.id))
    expect(derived).toHaveLength(2)
  })

  it('processes queued jobs end-to-end and marks them done', async () => {
    const original = await uploadTestImage(1000, 700)
    const job = await enqueueJob(db, 'thumbnail_generate', { fileId: original.id })

    const result = await processThumbnailJobs(pool, 10)
    expect(result.processed).toBeGreaterThanOrEqual(1)

    const done = await getJob(db, job.id)
    expect(done!.status).toBe('done')
    expect(done!.finishedAt).toBeTruthy()

    const derived = await db.select().from(appFiles)
      .where(and(eq(appFiles.sourceFileId, original.id), eq(appFiles.fileKind, 'thumbnail')))
    expect(derived).toHaveLength(1)
  })

  it('failed jobs record the error and retry with backoff until max attempts', async () => {
    const job = await enqueueJob(db, 'thumbnail_generate', { fileId: '00000000-0000-0000-0000-000000000000' }, 2)

    await processThumbnailJobs(pool, 10)
    let row = await getJob(db, job.id)
    expect(row!.status).toBe('queued') // first failure requeues with backoff
    expect(row!.lastError).toMatch(/not found/)
    expect(row!.attempts).toBe(1)

    // Force the backoff window open, then fail again → terminal
    await db.update(workerJobs).set({ runAfter: new Date() }).where(eq(workerJobs.id, job.id))
    await processThumbnailJobs(pool, 10)
    row = await getJob(db, job.id)
    expect(row!.status).toBe('failed')
    expect(row!.attempts).toBe(2)
  })
})
