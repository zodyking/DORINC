// sms_send handler — delivers queued Quo SMS messages (retry path).
import { sendQuoSmsDirect } from '../lib/sms-notify.mjs'

/**
 * Process queued sms_send jobs (drain up to batch per call).
 * @param {import('pg').Pool} pool
 * @param {number} [batch]
 * @returns {Promise<{ processed: number, failed: number }>}
 */
export async function processSmsJobs(pool, batch = 20) {
  let processed = 0
  let failed = 0

  for (let i = 0; i < batch; i++) {
    const client = await pool.connect()
    let job
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `SELECT id, payload, attempts, max_attempts FROM worker_jobs
         WHERE job_type = 'sms_send' AND status = 'queued' AND run_after <= now()
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
      await sendQuoSmsDirect(pool, job.payload)
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
        await pool.query(
          `UPDATE worker_jobs SET status = 'queued', run_after = now() + make_interval(secs => $2), last_error = $3 WHERE id = $1`,
          [job.id, 30 * 2 ** (attempts - 1), message],
        )
      }
    }
  }

  return { processed, failed }
}
