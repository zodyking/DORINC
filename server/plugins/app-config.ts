import { defineNitroPlugin } from 'nitropack/runtime'
import { hasDatabaseConfig } from '../services/runtime-config.service'
import { useDb } from '../db/client'
import { applyPendingMigrations } from '../db/migrate-runtime'
import { refreshAppConfigCache } from '../services/app-config.service'

export default defineNitroPlugin(async () => {
  if (!hasDatabaseConfig()) return

  try {
    await applyPendingMigrations(useDb())
    console.log('[migrate] pending migrations applied on boot')
  }
  catch (err) {
    console.error(`[migrate] boot migration failed: ${(err as Error).message}`)
  }

  try {
    await refreshAppConfigCache(useDb())
  }
  catch (err) {
    console.warn(`[app-config] cache warm skipped: ${(err as Error).message}`)
  }
})
