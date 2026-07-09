// thumbnail_generate handler — builds thumbnail + preview rows in app_files
// from an uploaded original image (SPEC §8, §18). Plain JS + raw SQL so it
// runs inside the worker container without a TypeScript toolchain.
import { createHash } from 'node:crypto'
import sharp from 'sharp'

export const THUMBNAIL_MAX_PX = 320
export const PREVIEW_MAX_PX = 1600

/**
 * Claim and process up to `batch` queued thumbnail jobs.
 * Claiming uses FOR UPDATE SKIP LOCKED so multiple workers never
 * double-process, and failures retry with exponential backoff.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<{ processed: number, failed: number }>}
 */
export async function processThumbnailJobs(pool, batch = 5) {
  let processed = 0
  let failed = 0

  for (let i = 0; i < batch; i++) {
    const client = await pool.connect()
    let job
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `SELECT id, payload, attempts, max_attempts FROM worker_jobs
         WHERE job_type = 'thumbnail_generate' AND status = 'queued' AND run_after <= now()
         ORDER BY created_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
      )
      job = rows[0]
      if (job) {
        await client.query(
          `UPDATE worker_jobs SET status = 'processing', attempts = attempts + 1, started_at = now() WHERE id = $1`,
          [job.id],
        )
      }
      await client.query('COMMIT')
    }
    catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    }
    finally {
      client.release()
    }

    if (!job) break

    try {
      await generateDerivatives(pool, job.payload.fileId)
      await pool.query(
        `UPDATE worker_jobs SET status = 'done', finished_at = now(), last_error = NULL WHERE id = $1`,
        [job.id],
      )
      processed++
    }
    catch (err) {
      failed++
      const message = err instanceof Error ? err.message : String(err)
      const attempts = job.attempts + 1
      if (attempts >= job.max_attempts) {
        await pool.query(
          `UPDATE worker_jobs SET status = 'failed', finished_at = now(), last_error = $2 WHERE id = $1`,
          [job.id, message],
        )
      }
      else {
        // Exponential backoff: 30s, 60s, 120s…
        await pool.query(
          `UPDATE worker_jobs SET status = 'queued', run_after = now() + make_interval(secs => $2), last_error = $3 WHERE id = $1`,
          [job.id, 30 * 2 ** (attempts - 1), message],
        )
      }
    }
  }

  return { processed, failed }
}

/**
 * Create thumbnail + preview app_files rows for an original image and
 * backfill its width/height. Idempotent — re-runs replace nothing and
 * skip kinds that already exist.
 *
 * @param {import('pg').Pool} pool
 * @param {string} fileId
 */
export async function generateDerivatives(pool, fileId) {
  const { rows } = await pool.query(
    `SELECT id, owner_entity_type, owner_entity_id, mime_type, original_filename, binary_data, created_by
     FROM app_files WHERE id = $1 AND archived_at IS NULL`,
    [fileId],
  )
  const original = rows[0]
  if (!original) throw new Error(`file ${fileId} not found or archived`)
  if (!original.mime_type.startsWith('image/')) throw new Error(`file ${fileId} is not an image`)

  const image = sharp(original.binary_data, { failOn: 'error' })
  const meta = await image.metadata()

  await pool.query(
    `UPDATE app_files SET width = $2, height = $3 WHERE id = $1 AND width IS NULL`,
    [fileId, meta.width ?? null, meta.height ?? null],
  )

  const { rows: existing } = await pool.query(
    `SELECT file_kind FROM app_files WHERE source_file_id = $1 AND archived_at IS NULL`,
    [fileId],
  )
  const existingKinds = new Set(existing.map(r => r.file_kind))

  const targets = [
    { kind: 'thumbnail', maxPx: THUMBNAIL_MAX_PX, quality: 70 },
    { kind: 'preview', maxPx: PREVIEW_MAX_PX, quality: 82 },
  ].filter(t => !existingKinds.has(t.kind))

  const baseName = original.original_filename.replace(/\.[^.]+$/, '')

  for (const target of targets) {
    const resized = await sharp(original.binary_data, { failOn: 'error' })
      .rotate() // respect EXIF orientation
      .resize(target.maxPx, target.maxPx, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: target.quality })
      .toBuffer({ resolveWithObject: true })

    const sha256 = createHash('sha256').update(resized.data).digest('hex')

    await pool.query(
      `INSERT INTO app_files
        (owner_entity_type, owner_entity_id, file_kind, source_file_id, original_filename,
         mime_type, file_size_bytes, sha256_hash, width, height, binary_data, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        original.owner_entity_type,
        original.owner_entity_id,
        target.kind,
        fileId,
        `${baseName}.${target.kind}.webp`,
        'image/webp',
        resized.data.length,
        sha256,
        resized.info.width,
        resized.info.height,
        resized.data,
        original.created_by,
      ],
    )
  }
}
