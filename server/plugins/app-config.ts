import { defineNitroPlugin } from 'nitropack/runtime'
import { hasDatabaseConfig } from '../services/runtime-config.service'
import { useDb } from '../db/client'
import { applyPendingMigrations } from '../db/migrate-runtime'
import { syncAuthRegistry } from '../db/seed'
import { refreshAppConfigCache } from '../services/app-config.service'
import { refreshImapConfigCache } from '../services/imap-config.service'

export default defineNitroPlugin(async () => {
  if (!hasDatabaseConfig()) return

  const db = useDb()

  // Fail boot if migrations cannot apply — redeploy must not run on a stale schema.
  await applyPendingMigrations(db)

  try {
    await syncAuthRegistry(db)
    console.log('[seed] auth registry synced on boot')
  }
  catch (err) {
    console.warn(`[seed] auth registry sync skipped: ${(err as Error).message}`)
  }

  try {
    await refreshAppConfigCache(db)
    await refreshImapConfigCache(db)
  }
  catch (err) {
    console.warn(`[app-config] cache warm skipped: ${(err as Error).message}`)
  }
})
