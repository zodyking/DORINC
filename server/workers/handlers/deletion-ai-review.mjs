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

function isRetryableSusanSkip(decision, note) {
  if (decision !== 'skipped') return false
  const n = String(note || '').toLowerCase()
  if (n.includes('already decided') || n.includes('not found')) return false
  return true
}

/**
 * Re-queue open pending deletion requests that have no active review job.
 * Mirrors Nitro catch-up for dedicated workers after restarts / dormant queues.
 *
 * @param {import('pg').Pool} pool
 * @param {{ limit?: number, ignoreCooldown?: boolean }} [opts]
 */
export async function catchUpPendingDeletionAiReviewJobs(pool, opts = {}) {
  const limit = opts.limit ?? 50
  void opts.ignoreCooldown

  const enabled = await pool.query(
    `SELECT ai_administrator_review_wait_minutes
     FROM ai_provider_settings
     WHERE enabled = true
       AND ai_administrator_enabled = true
       AND encrypted_api_key IS NOT NULL
     LIMIT 1`,
  )
  if (!enabled.rowCount) return { enqueued: 0, pending: 0 }

  const rawWait = Number(enabled.rows[0]?.ai_administrator_review_wait_minutes)
  const waitMinutes = Number.isFinite(rawWait)
    ? Math.min(1440, Math.max(0, Math.round(rawWait)))
    : 5

  const pending = await pool.query(
    `SELECT id, created_at
     FROM entity_deletion_requests
     WHERE status = 'pending'
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit],
  )
  if (!pending.rowCount) return { enqueued: 0, pending: 0 }

  // Only block live jobs — retryable skips must not freeze the queue.
  const blocked = await pool.query(
    `SELECT payload->>'requestId' AS request_id
     FROM worker_jobs
     WHERE job_type = 'deletion_request_ai_review'
       AND status IN ('queued', 'processing')`,
  )
  const blockedIds = new Set(
    blocked.rows.map(row => String(row.request_id || '')).filter(Boolean),
  )

  let enqueued = 0
  for (const row of pending.rows) {
    const requestId = String(row.id || '')
    if (!requestId || blockedIds.has(requestId)) continue
    // Wait from when the request was opened so a real admin can respond first.
    await pool.query(
      `INSERT INTO worker_jobs (job_type, payload, max_attempts, status, run_after)
       VALUES (
         'deletion_request_ai_review',
         $1::jsonb,
         3,
         'queued',
         GREATEST(now(), $2::timestamptz + make_interval(mins => $3::int))
       )`,
      [JSON.stringify({ requestId }), row.created_at, waitMinutes],
    )
    blockedIds.add(requestId)
    enqueued += 1
  }

  if (enqueued) {
    console.info(
      `[deletion-ai-review] catch-up enqueued=${enqueued} pending=${pending.rowCount}`,
    )
  }
  return { enqueued, pending: pending.rowCount }
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

  // Keep Susan awake for open requests (dedicated-worker path).
  await catchUpPendingDeletionAiReviewJobs(pool, { ignoreCooldown: false }).catch((err) => {
    console.warn('[deletion-ai-review] catch-up failed:', err?.message || err)
  })

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

      const decision = payload?.decision || 'unknown'
      const note = payload?.note || null
      const attempts = Number(job.attempts || 0) + 1

      if (isRetryableSusanSkip(decision, note)) {
        if (attempts >= Number(job.max_attempts || 3)) {
          await pool.query(
            `UPDATE worker_jobs SET status = 'failed', finished_at = now(), last_error = $2 WHERE id = $1`,
            [job.id, note || 'AI Administrator skipped'],
          )
        }
        else {
          const backoffSecs = Math.min(60, Math.max(10, attempts * 10))
          await pool.query(
            `UPDATE worker_jobs
             SET status = 'queued',
                 started_at = NULL,
                 run_after = now() + make_interval(secs => $2),
                 last_error = $3
             WHERE id = $1`,
            [job.id, backoffSecs, note || 'AI Administrator skipped'],
          )
        }
        failed += 1
        console.warn('[deletion-ai-review] retryable skip', requestId, note)
        continue
      }

      await pool.query(
        `UPDATE worker_jobs SET status = 'done', finished_at = now(), last_error = NULL WHERE id = $1`,
        [job.id],
      )
      processed += 1
      console.info(
        '[deletion-ai-review] done',
        requestId,
        decision,
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
