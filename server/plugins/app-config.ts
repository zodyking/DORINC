import { defineNitroPlugin } from 'nitropack/runtime'
import { hasDatabaseConfig } from '../services/runtime-config.service'
import { useDb } from '../db/client'
import { refreshAppConfigCache } from '../services/app-config.service'

export default defineNitroPlugin(async () => {
  if (!hasDatabaseConfig()) return
  try {
    await refreshAppConfigCache(useDb())
  }
  catch (err) {
    console.warn(`[app-config] cache warm skipped: ${(err as Error).message}`)
  }
})
