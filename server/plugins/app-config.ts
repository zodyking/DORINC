import { defineNitroPlugin } from 'nitropack/runtime'
import { hasDatabaseConfig } from '../services/runtime-config.service'
import { useDb } from '../db/client'
import { applyPendingMigrations } from '../db/migrate-runtime'
import { syncNumberSequences } from '../db/sync-sequences'
import { syncAuthRegistry } from '../db/seed'
import { refreshAppConfigCache } from '../services/app-config.service'

export default defineNitroPlugin(async () => {
  if (!hasDatabaseConfig()) return

  const db = useDb()

  // Fail boot if migrations cannot apply — redeploy must not run on a stale schema.
  await applyPendingMigrations(db)

  try {
    const sequences = await syncNumberSequences(db)
    console.log(`[sequences] synced invoice=${sequences.invoiceNumber} service_log=${sequences.serviceLogNumber} estimate=${sequences.estimateNumber}`)
  }
  catch (err) {
    console.warn(`[sequences] sync skipped: ${(err as Error).message}`)
  }

  try {
    await syncAuthRegistry(db)
    console.log('[seed] auth registry synced on boot')
  }
  catch (err) {
    console.warn(`[seed] auth registry sync skipped: ${(err as Error).message}`)
  }

  try {
    await refreshAppConfigCache(db)
  }
  catch (err) {
    console.warn(`[app-config] cache warm skipped: ${(err as Error).message}`)
  }
})
