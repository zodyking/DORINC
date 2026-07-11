import { sql } from 'drizzle-orm'
import { hasDatabaseConfig } from '../services/runtime-config.service'
import { useDb } from '../db/client'
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

  let database: 'ok' | 'error' = 'ok'
  try {
    await useDb().execute(sql`select 1`)
  }
  catch {
    database = 'error'
  }

  setResponseStatus(event, database === 'ok' ? 200 : 503)

  return {
    status: database === 'ok' ? 'ok' : 'degraded',
    database,
    version: pkg.version ?? '0.0.0',
    buildId,
    requestId: (event.context.requestId as string | undefined) ?? '',
    time: new Date().toISOString(),
  }
})
