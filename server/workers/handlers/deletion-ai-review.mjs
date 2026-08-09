/**
 * Susan AI Administrator — process delayed deletion_request_ai_review jobs.
 * Claims from worker_jobs, then asks the Nitro app (TS services) to run the review.
 */

function appBaseUrl() {
  return (process.env.APP_URL || process.env.NUXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000')
    .trim()
    .replace(/\/$/, '')
}

function workerToken() {
  return (process.env.INTERNAL_WORKER_TOKEN || process.env.ENCRYPTION_MASTER_KEY || '').trim()
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} [batch]
 */
export async function processDeletionAiReviewJobs(pool, batch = 3) {
  let processed = 0
  let failed = 0
  const token = workerToken()
  if (!token) {
    // Without a token we cannot call the internal review API safely.
    return { processed, failed, skipped: true }
  }

  for (let i = 0; i < batch; i++) {
    const client = await pool.connect()
    let job
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `SELECT id, payload, attempts, max_attempts FROM worker_jobs
         WHERE job_type = 'deletion_request_ai_review'
           AND status = 'queued' AND run_after <= now()
         ORDER BY run_after ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
      )
      job = rows[0]
      if (job) {
        await client.query(
          `UPDATE worker_jobs
           SET status = 'processing', attempts = attempts + 1, started_at = now()
           WHERE id = $1`,
          [job.id],
        )
      }
      await client.query('COMMIT')
    }
    catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      client.release()
      throw err
    }
    client.release()

    if (!job) break

    const requestId = String(job.payload?.requestId || '')
    try {
      if (!requestId) throw new Error('Missing requestId in job payload')

      const res = await fetch(`${appBaseUrl()}/api/internal/ai-administrator/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-worker-token': token,
        },
        body: JSON.stringify({ requestId }),
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = payload?.message || payload?.data?.message || `Review API returned ${res.status}`
        throw new Error(message)
      }

      await pool.query(
        `UPDATE worker_jobs SET status = 'done', finished_at = now(), last_error = NULL WHERE id = $1`,
        [job.id],
      )
      processed += 1
      console.info(
        '[deletion-ai-review] done',
        requestId,
        payload?.decision || 'unknown',
      )
    }
    catch (err) {
      failed += 1
      const message = err instanceof Error ? err.message : String(err)
      const attempts = Number(job.attempts || 0) + 1
      if (attempts >= Number(job.max_attempts || 3)) {
        await pool.query(
          `UPDATE worker_jobs SET status = 'failed', finished_at = now(), last_error = $2 WHERE id = $1`,
          [job.id, message],
        )
      }
      else {
        await pool.query(
          `UPDATE worker_jobs
           SET status = 'queued',
               started_at = NULL,
               run_after = now() + make_interval(secs => $2),
               last_error = $3
           WHERE id = $1`,
          [job.id, Math.min(120, 15 * attempts), message],
        )
      }
      console.error('[deletion-ai-review] failed', job.id, message)
    }
  }

  return { processed, failed }
}
