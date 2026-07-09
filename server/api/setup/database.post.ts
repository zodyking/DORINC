import {
  buildDatabaseUrl,
  saveRuntimeDatabaseConfig,
  hasDatabaseConfig,
} from '../../services/runtime-config.service'
import { resetDbPool, testDatabaseConnection, useDb } from '../../db/client'
import { applyPendingMigrations } from '../../db/migrate-runtime'
import { seedAuth } from '../../db/seed'
import { isBootstrapped } from '../../services/setup.service'
import { apiError } from '../../utils/api-error'
import { validateBody } from '../../utils/validate'
import { setupDatabaseSchema } from '../../../shared/validators/setup'

export default defineEventHandler(async (event) => {
  if (hasDatabaseConfig()) {
    const db = useDb()
    if (await isBootstrapped(db)) {
      throw apiError(event, 'CONFLICT', 'Setup is locked')
    }
  }

  const body = await validateBody(event, setupDatabaseSchema)
  const config = {
    host: body.host,
    port: body.port,
    database: body.database,
    username: body.username,
    password: body.password,
  }

  const connectionString = buildDatabaseUrl(config)

  try {
    await testDatabaseConnection(connectionString)
    await saveRuntimeDatabaseConfig(config)
    await resetDbPool()

    const db = useDb()
    await applyPendingMigrations(db)
    await seedAuth(connectionString)

    return {
      ok: true,
      message: 'Connected — migrations applied and system seed complete',
    }
  }
  catch (err) {
    await resetDbPool().catch(() => {})
    throw apiError(event, 'SERVICE_UNAVAILABLE', `Database setup failed: ${(err as Error).message}`)
  }
})
