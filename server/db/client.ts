import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

let _pool: Pool | undefined
let _db: ReturnType<typeof createDb> | undefined

function createDb(pool: Pool) {
  return drizzle({ client: pool, schema })
}

export function usePool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set')
    }
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
