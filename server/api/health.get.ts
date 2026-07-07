import { sql } from 'drizzle-orm'
import { useDb } from '../db/client'
import pkg from '../../package.json'

export default defineEventHandler(async (event) => {
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
    time: new Date().toISOString(),
  }
})
