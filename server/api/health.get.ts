import { sql } from 'drizzle-orm'
import { hasDatabaseConfig } from '../services/runtime-config.service'
import { useDb } from '../db/client'
import { getPdfWorkerHealth, getWorkerQueueHealth } from '../services/worker-health.service'
import pkg from '../../package.json'

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
    await db.execute(sql`select 1`)
  }
  catch {
    database = 'error'
  }

  let workers: { pdf: string, queue: string } | undefined
  if (database === 'ok') {
    try {
      const [pdf, queue] = await Promise.all([
        getPdfWorkerHealth(db),
        getWorkerQueueHealth(db),
      ])
      workers = { pdf: pdf.status, queue: queue.status }
    }
    catch {
      workers = { pdf: 'unknown', queue: 'unknown' }
    }
  }

  const pipelineOk = !workers
    || (workers.pdf !== 'error' && workers.pdf !== 'unknown' && workers.queue !== 'error')
  const ok = database === 'ok' && pipelineOk

  setResponseStatus(event, ok ? 200 : 503)

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
