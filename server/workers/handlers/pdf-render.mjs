// pdf_render handler — Blade payload → PDF via Laravel + barryvdh/laravel-dompdf.
import { createHash } from 'node:crypto'
import {
  parsePdfRenderPayload,
  renderDocumentPdfBuffer,
  shouldUsePdfRenderService,
} from '../../lib/laravel-pdf-client.mjs'

/**
 * @param {import('pg').Pool} pool
 * @param {object} job
 */
async function finalizePdfRenderJob(pool, job) {
  const fileId = await renderPayloadToAppFile(pool, job)

  if (job.entity_type === 'invoice') {
    const { rows: fileRows } = await pool.query(
      `SELECT sha256_hash FROM app_files WHERE id = $1`,
      [fileId],
    )
    await pool.query(
      `INSERT INTO invoice_files
        (invoice_id, file_id, template_version_id, sha256_hash, pdf_render_job_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (invoice_id) DO NOTHING`,
      [
        job.entity_id,
        fileId,
        job.template_version_id,
        fileRows[0].sha256_hash,
        job.id,
        job.created_by,
      ],
    )
  }

  if (job.entity_type === 'estimate') {
    const { rows: fileRows } = await pool.query(
      `SELECT sha256_hash FROM app_files WHERE id = $1`,
      [fileId],
    )
    await pool.query(
      `INSERT INTO estimate_files
        (estimate_id, file_id, template_version_id, sha256_hash, pdf_render_job_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (estimate_id) DO NOTHING`,
      [
        job.entity_id,
        fileId,
        job.template_version_id,
        fileRows[0].sha256_hash,
        job.id,
        job.created_by,
      ],
    )
  }

  await pool.query(
    `UPDATE pdf_render_jobs
     SET status = 'done', finished_at = now(), last_error = NULL, output_file_id = $2
     WHERE id = $1`,
    [job.id, fileId],
  )
}

/**
 * @param {import('pg').Pool} pool
 * @param {object} job
 */
async function failPdfRenderJob(pool, job, err) {
  const message = err instanceof Error ? err.message : String(err)
  const attempts = job.attempts
  if (attempts >= job.max_attempts) {
    await pool.query(
      `UPDATE pdf_render_jobs SET status = 'failed', finished_at = now(), last_error = $2 WHERE id = $1`,
      [job.id, message],
    )
  }
  else {
    await pool.query(
      `UPDATE pdf_render_jobs
       SET status = 'queued', run_after = now() + make_interval(secs => $2), last_error = $3
       WHERE id = $1`,
      [job.id, 30 * 2 ** (attempts - 1), message],
    )
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} jobId
 */
export async function processPdfRenderJobById(pool, jobId) {
  const client = await pool.connect()
  let job
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT id, entity_type, entity_id, html_content, original_filename,
              attempts, max_attempts, created_by, template_version_id, status, run_after
       FROM pdf_render_jobs
       WHERE id = $1
       FOR UPDATE`,
      [jobId],
    )
    job = rows[0]
    if (job && job.status === 'queued' && new Date(job.run_after) <= new Date()) {
      await client.query(
        `UPDATE pdf_render_jobs
         SET status = 'processing', attempts = attempts + 1, started_at = now()
         WHERE id = $1`,
        [job.id],
      )
      job.attempts += 1
      job.status = 'processing'
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

  if (!job || job.status === 'done' || job.status === 'failed') {
    return { processed: 0, failed: 0 }
  }

  if (job.status !== 'processing') {
    return { processed: 0, failed: 0 }
  }

  try {
    await finalizePdfRenderJob(pool, job)
    return { processed: 1, failed: 0 }
  }
  catch (err) {
    await failPdfRenderJob(pool, job, err)
    return { processed: 0, failed: 1 }
  }
}

/** @param {import('pg').Pool} pool */
export async function processPdfRenderJobs(pool, batch = 3) {
  let processed = 0
  let failed = 0

  for (let i = 0; i < batch; i++) {
    const client = await pool.connect()
    let job
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `SELECT id, entity_type, entity_id, html_content, original_filename,
                attempts, max_attempts, created_by, template_version_id
         FROM pdf_render_jobs
         WHERE status = 'queued' AND run_after <= now()
         ORDER BY created_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
      )
      job = rows[0]
      if (job) {
        await client.query(
          `UPDATE pdf_render_jobs
           SET status = 'processing', attempts = attempts + 1, started_at = now()
           WHERE id = $1`,
          [job.id],
        )
        job.attempts += 1
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
      await finalizePdfRenderJob(pool, job)
      processed++
    }
    catch (err) {
      failed++
      await failPdfRenderJob(pool, job, err)
    }
  }

  return { processed, failed }
}

/**
 * Render Blade payload to PDF bytes and persist in app_files.
 *
 * @param {import('pg').Pool} pool
 * @param {object} job
 * @returns {Promise<string>} app_files.id
 */
export async function renderPayloadToAppFile(pool, job) {
  const pdfBuffer = await payloadToPdf(job.html_content)

  const sha256 = createHash('sha256').update(pdfBuffer).digest('hex')
  const { rows } = await pool.query(
    `INSERT INTO app_files
      (owner_entity_type, owner_entity_id, file_kind, original_filename,
       mime_type, file_size_bytes, sha256_hash, binary_data, created_by)
     VALUES ($1, $2, 'pdf', $3, 'application/pdf', $4, $5, $6, $7)
     RETURNING id`,
    [
      job.entity_type,
      job.entity_id,
      job.original_filename,
      pdfBuffer.length,
      sha256,
      pdfBuffer,
      job.created_by,
    ],
  )
  return rows[0].id
}

/** @param {string} storedContent */
export async function payloadToPdf(storedContent) {
  const payload = parsePdfRenderPayload(storedContent)
  if (!payload) {
    throw new Error('Legacy HTML PDF jobs are no longer supported. Re-queue the document to use Laravel Blade rendering.')
  }
  if (!shouldUsePdfRenderService()) {
    throw new Error('PDF_RENDER_URL is required for Blade PDF rendering (laravel-pdf service).')
  }
  return renderDocumentPdfBuffer(payload)
}

/** @deprecated Use renderPayloadToAppFile */
export async function renderHtmlToAppFile(pool, job) {
  return renderPayloadToAppFile(pool, job)
}
