// Verify database connectivity at worker startup (clear errors for Dockploy DNS issues).
import pg from 'pg'
import { getDatabaseUrl } from './runtime-config.mjs'

function hostFromConnectionString(url) {
  try {
    return new URL(url).hostname
  }
  catch {
    return '(unknown)'
  }
}

export async function verifyDatabaseConnection(label = 'worker') {
  const connectionString = getDatabaseUrl()
  if (!connectionString) {
    console.error(`[${label}] database not configured — complete /setup or set DATABASE_URL`)
    process.exit(1)
  }

  const pool = new pg.Pool({ connectionString, max: 1 })
  try {
    await pool.query('select 1')
    console.log(`[${label}] database connection ok (${hostFromConnectionString(connectionString)})`)
  }
  catch (err) {
    const host = hostFromConnectionString(connectionString)
    if (err?.code === 'ENOTFOUND') {
      console.error(
        `[${label}] cannot resolve database host "${host}". `
        + 'Workers must join dokploy-network (see docker-compose.yml). '
        + 'Alternatively set DATABASE_URL in Dockploy env for all services.',
      )
    }
    else {
      console.error(`[${label}] database connection failed (${host}):`, err)
    }
    process.exit(1)
  }
  finally {
    await pool.end()
  }
}
