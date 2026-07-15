import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'
import { getDatabaseUrl, hasDatabaseConfig } from '../services/runtime-config.service'

let _pool: Pool | undefined
let _db: ReturnType<typeof createDb> | undefined

function createDb(pool: Pool) {
  return drizzle({ client: pool, schema })
}

export function hasDatabaseConfigured(): boolean {
  return hasDatabaseConfig()
}

/** Close pool after setup wizard saves new database credentials. */
export async function resetDbPool(): Promise<void> {
  if (_pool) {
    await _pool.end().catch(() => {})
  }
  _pool = undefined
  _db = undefined
}

/** Node may resolve localhost to ::1 while Postgres listens on 127.0.0.1 only. */
function normalizeDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'localhost') {
      parsed.hostname = '127.0.0.1'
      return parsed.toString()
    }
    return url
  }
  catch {
    return url.replace(/@localhost(?=[:/]|$)/g, '@127.0.0.1')
  }
}

export function usePool(): Pool {
  if (!_pool) {
    const raw = getDatabaseUrl()
    if (!raw) {
      throw new Error('DATABASE_NOT_CONFIGURED')
    }
    const connectionString = normalizeDatabaseUrl(raw)
    _pool = new Pool({ connectionString, max: 10 })
  }
  return _pool
}

export function useDb() {
  if (!_db) {
    _db = createDb(usePool())
  }
  return _db
}

export type Db = ReturnType<typeof useDb>

/** Test a connection string without touching the singleton pool. */
export async function testDatabaseConnection(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString, max: 1 })
  try {
    await pool.query('select 1')
  }
  finally {
    await pool.end()
  }
}
