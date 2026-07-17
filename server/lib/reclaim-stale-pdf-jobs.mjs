/** Re-queue or fail pdf_render_jobs left in processing after a worker crash. */
const DEFAULT_STALE_SEC = 10 * 60

/**
 * @param {import('pg').Pool} pool
 * @param {number} [staleSec]
 */
export async function reclaimStalePdfRenderJobs(pool, staleSec = DEFAULT_STALE_SEC) {
  const { rows } = await pool.query(
    `UPDATE pdf_render_jobs
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
     RETURNING id, status`,
    [staleSec],
  )
  return rows
}
