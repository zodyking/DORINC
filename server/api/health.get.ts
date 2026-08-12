import { sql } from 'drizzle-orm'
import { hasDatabaseConfig } from '../services/runtime-config.service'
import { useDb } from '../db/client'
import { getPdfWorkerHealth, getWorkerQueueHealth } from '../services/worker-health.service'
import pkg from '../../package.json'

const DB_PROBE_TIMEOUT_MS = 2_000

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('HEALTH_PROBE_TIMEOUT')), ms)
      }),
    ])
  }
  finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Liveness probe for Docker/Traefik.
 *
 * Always answers 200 when the process can serve a request. A saturated or slow
 * database used to fail this probe, which marked the container unhealthy and
 * made the proxy drop it — turning one user's heavy request into an outage for
 * every signed-in session. Dependency status is reported in the body instead.
 *
 * `?deep=1` adds database + worker probes for the admin panel.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const buildId = config.public.buildId ?? 'dev'
  const query = getQuery(event)
  const deep = query.deep === '1' || query.deep === 'true'

  const base = {
    version: pkg.version ?? '0.0.0',
    buildId,
    requestId: (event.context.requestId as string | undefined) ?? '',
    time: new Date().toISOString(),
  }

  if (!hasDatabaseConfig()) {
    setResponseStatus(event, 200)
    return { status: 'setup_required', database: 'not_configured', ...base }
  }

  if (!deep) {
    setResponseStatus(event, 200)
    return { status: 'ok', ...base }
  }

  const db = useDb()
  let database: 'ok' | 'error' = 'ok'
  try {
    await withTimeout(db.execute(sql`select 1`), DB_PROBE_TIMEOUT_MS)
  }
  catch {
    database = 'error'
  }

  let workers: { pdf: string, queue: string } | undefined
  if (database === 'ok') {
    try {
      const [pdf, queue] = await withTimeout(Promise.all([
        getPdfWorkerHealth(db),
        getWorkerQueueHealth(db),
      ]), 6_000)
      workers = { pdf: pdf.status, queue: queue.status }
    }
    catch {
      workers = { pdf: 'unknown', queue: 'unknown' }
    }
  }

  const pipelineOk = !workers
    || (workers.pdf !== 'error' && workers.pdf !== 'unknown' && workers.queue !== 'error')

  // Deep probe still answers 200 — it reports health, it does not gate traffic.
  setResponseStatus(event, 200)

  return {
    status: database === 'ok' && pipelineOk ? 'ok' : 'degraded',
    database,
    workers,
    ...base,
  }
})
