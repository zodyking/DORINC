import { defineNitroPlugin } from 'nitropack/runtime'
import { hasDatabaseConfig } from '../services/runtime-config.service'
import { useDb } from '../db/client'
import { applyPendingMigrations } from '../db/migrate-runtime'
import { refreshAppConfigCache } from '../services/app-config.service'
import { ensureDefaultInvoiceTemplate } from '../services/invoice-templates.service'

export default defineNitroPlugin(async () => {
  if (!hasDatabaseConfig()) return

  // Fail boot if migrations cannot apply — Dockploy redeploy must not run on a stale schema.
  await applyPendingMigrations(useDb())
  console.log('[migrate] pending migrations applied on boot')

  const db = useDb()
  try {
    await ensureDefaultInvoiceTemplate(db)
  }
  catch (err) {
    console.warn(`[invoice-templates] default seed skipped: ${(err as Error).message}`)
  }

  try {
    await refreshAppConfigCache(db)
  }
  catch (err) {
    console.warn(`[app-config] cache warm skipped: ${(err as Error).message}`)
  }
})
