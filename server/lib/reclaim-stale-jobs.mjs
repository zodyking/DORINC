/** Re-queue or fail worker jobs left in processing after a worker crash or handler bug. */
const DEFAULT_STALE_SEC = 10 * 60

/**
 * @param {import('pg').Pool} pool
 * @param {number} [staleSec]
 */
export async function reclaimStaleWorkerJobs(pool, staleSec = DEFAULT_STALE_SEC) {
  const { rows } = await pool.query(
    `UPDATE worker_jobs
     SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
         started_at = NULL,
         finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE finished_at END,
         last_error = CASE
           WHEN attempts >= max_attempts THEN COALESCE(last_error, 'stale processing reclaim')
           ELSE last_error
         END,
         run_after = CASE WHEN attempts >= max_attempts THEN run_after ELSE now() END
     WHERE status = 'processing'
       AND started_at IS NOT NULL
       AND started_at < now() - ($1 || ' seconds')::interval
     RETURNING id, job_type, status`,
    [staleSec],
  )
  return rows
}
