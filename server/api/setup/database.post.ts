import {
  buildDatabaseUrl,
  saveRuntimeDatabaseConfig,
  hasDatabaseConfig,
} from '../../services/runtime-config.service'
import { resetDbPool, testDatabaseConnection, useDb } from '../../db/client'
import { applyPendingMigrations } from '../../db/migrate-runtime'
import { syncAuthRegistry } from '../../db/seed'
import { isBootstrapped } from '../../services/setup.service'
import { apiError } from '../../utils/api-error'
import { validateBody } from '../../utils/validate'
import { parsePostgresConnectionString } from '../../../shared/postgres-connection'
import {
  setupDatabaseFieldsSchema,
  setupDatabaseSchema,
  type SetupDatabaseInput,
} from '../../../shared/validators/setup'

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err) return err
  return 'Unknown database setup error'
}

function resolveDatabaseConfig(body: {
  connectionString?: string
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string
}): SetupDatabaseInput {
  if (typeof body.connectionString === 'string') {
    const parsed = parsePostgresConnectionString(body.connectionString)
    return setupDatabaseFieldsSchema.parse(parsed)
  }
  return setupDatabaseFieldsSchema.parse(body)
}

export default defineEventHandler(async (event) => {
  if (hasDatabaseConfig()) {
    try {
      const db = useDb()
      if (await isBootstrapped(db)) {
        throw apiError(event, 'CONFLICT', 'Setup is locked')
      }
    }
    catch (err) {
      // Stale/broken runtime config — allow wizard to overwrite credentials.
      if ((err as { statusCode?: number })?.statusCode === 409) throw err
    }
  }

  let config: SetupDatabaseInput
  try {
    const body = await validateBody(event, setupDatabaseSchema)
    config = resolveDatabaseConfig(body)
  }
  catch (err) {
    // validateBody already throws H3 errors; parse failures become clear 422s.
    if ((err as { statusCode?: number })?.statusCode) throw err
    throw apiError(event, 'VALIDATION_ERROR', errorMessage(err), {
      issues: [{ path: 'connectionString', message: errorMessage(err) }],
    })
  }

  const connectionString = buildDatabaseUrl(config)

  try {
    await testDatabaseConnection(connectionString)
    await saveRuntimeDatabaseConfig(config)
    await resetDbPool()

    const db = useDb()
    await applyPendingMigrations(db)
    await syncAuthRegistry(db)

    return {
      ok: true,
      message: 'Connected — migrations applied and system seed complete',
    }
  }
  catch (err) {
    await resetDbPool().catch(() => {})
    throw apiError(event, 'SERVICE_UNAVAILABLE', `Database setup failed: ${errorMessage(err)}`)
  }
})
