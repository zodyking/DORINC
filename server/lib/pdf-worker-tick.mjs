// Shared pdf-worker tick — used by pdf-worker.mjs and embedded Nitro workers.
import { processPdfRenderJobs } from '../workers/handlers/pdf-render.mjs'
import { touchWorkerHeartbeat } from './worker-heartbeat.mjs'
import { reclaimStalePdfRenderJobs } from './reclaim-stale-pdf-jobs.mjs'

/**
 * @param {import('pg').Pool} pool
 * @param {{ logPrefix?: string }} [opts]
 */
export async function runPdfWorkerTick(pool, opts = {}) {
  const logPrefix = opts.logPrefix ?? '[pdf-worker]'

  const reclaimed = await reclaimStalePdfRenderJobs(pool)
  if (reclaimed.length) {
    console.warn(`${logPrefix} reclaimed ${reclaimed.length} stale pdf job(s):`, reclaimed.map(r => r.status).join(', '))
  }

  await touchWorkerHeartbeat(pool, 'pdf')
  const result = await processPdfRenderJobs(pool)
  if (result.processed || result.failed) {
    console.log(`${logPrefix} pdf_render processed=${result.processed} failed=${result.failed}`)
  }
}
