// imap_sync handler — periodic Gmail/IMAP inbox polling for customer email threads.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadImapConfig } from '../lib/app-config.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SYNC_SCRIPT = join(__dirname, '../../../scripts/run-imap-sync.ts')

function defaultSyncIntervalMs() {
  return Number(process.env.IMAP_SYNC_INTERVAL_MS ?? 60_000)
}

function runSyncScript() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', SYNC_SCRIPT],
      { stdio: 'inherit', env: process.env, cwd: join(__dirname, '../../..') },
    )
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(undefined)
      else reject(new Error(`imap sync exited with code ${code}`))
    })
  })
}

/**
 * Enqueue periodic IMAP sync when configured and interval elapsed.
 * @param {import('pg').Pool} pool
 */
export async function maybeEnqueueImapSync(pool) {
  const config = await loadImapConfig(pool)
  if (!config?.host || !config.user) return false

  const { rows: active } = await pool.query(
    `SELECT id FROM worker_jobs
     WHERE job_type = 'imap_sync' AND status IN ('queued', 'processing')
     LIMIT 1`,
  )
  if (active[0]) return false

  const intervalMs = defaultSyncIntervalMs()
  const { rows: stateRows } = await pool.query(
    `SELECT last_sync_at FROM imap_sync_state WHERE id = 'default' LIMIT 1`,
  )
  const lastSync = stateRows[0]?.last_sync_at
  if (lastSync) {
    const elapsed = Date.now() - new Date(lastSync).getTime()
    if (elapsed < intervalMs) return false
  }

  await pool.query(
    `INSERT INTO worker_jobs (job_type, payload, status, attempts, max_attempts, run_after)
     VALUES ('imap_sync', $1, 'queued', 0, 3, now())`,
    [JSON.stringify({ trigger: 'scheduled' })],
  )
  return true
}

/**
 * Process queued imap_sync jobs.
 * @param {import('pg').Pool} pool
 * @param {number} [batch]
 */
export async function processImapSyncJobs(pool, batch = 1) {
  let processed = 0
  let failed = 0

  for (let i = 0; i < batch; i++) {
    const client = await pool.connect()
    let job
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `SELECT id, payload, attempts, max_attempts FROM worker_jobs
         WHERE job_type = 'imap_sync' AND status = 'queued' AND run_after <= now()
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
      await runSyncScript()
      await pool.query(
        `UPDATE worker_jobs SET status = 'done', finished_at = now(), error_message = NULL WHERE id = $1`,
        [job.id],
      )
      processed++
    }
    catch (err) {
      const attempts = job.attempts
      const maxAttempts = job.max_attempts ?? 3
      const retryDelaySec = Math.min(60 * attempts, 900)
      const isFinal = attempts >= maxAttempts
      await pool.query(
        `UPDATE worker_jobs SET
           status = $2,
           finished_at = CASE WHEN $3 THEN now() ELSE NULL END,
           error_message = $4,
           run_after = CASE WHEN $3 THEN run_after ELSE now() + ($5 || ' seconds')::interval END
         WHERE id = $1`,
        [job.id, isFinal ? 'failed' : 'queued', isFinal, String(err?.message ?? err), retryDelaySec],
      )
      failed++
      console.error('[worker] imap_sync failed', err)
    }
  }

  return { processed, failed }
}
