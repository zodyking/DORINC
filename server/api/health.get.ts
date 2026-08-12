import { sql } from 'drizzle-orm'
import { hasDatabaseConfig } from '../services/runtime-config.service'
import { useDb } from '../db/client'
import { getPdfWorkerHealth, getWorkerQueueHealth } from '../services/worker-health.service'
import { healthHttpOk } from '../../shared/health-http'
import pkg from '../../package.json'

const DB_PROBE_TIMEOUT_MS = 4_000

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

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const buildId = config.public.buildId ?? 'dev'

  if (!hasDatabaseConfig()) {
    setResponseStatus(event, 200)
    return {
      status: 'setup_required',
      database: 'not_configured',
      version: pkg.version ?? '0.0.0',
      buildId,
      requestId: (event.context.requestId as string | undefined) ?? '',
      time: new Date().toISOString(),
    }
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

  const { live, ok } = healthHttpOk({ database, workers })

  // Liveness for Docker/Traefik: only fail when the DB probe fails.
  // Worker/pdf "unknown" or "error" used to return 503 and take the whole site
  // offline (raw Traefik 404) for every session during deploys / stale heartbeats.
  setResponseStatus(event, live ? 200 : 503)

  return {
    status: ok ? 'ok' : 'degraded',
    database,
    workers,
    version: pkg.version ?? '0.0.0',
    buildId,
    requestId: (event.context.requestId as string | undefined) ?? '',
    time: new Date().toISOString(),
  }
})
