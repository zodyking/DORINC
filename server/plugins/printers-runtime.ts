import { defineNitroPlugin } from 'nitropack/runtime'
import { hasDatabaseConfig } from '../services/runtime-config.service'

/**
 * Resume Tailscale printer devices on boot. Queue drain and IMAP polling
 * run on the dedicated worker via POST /api/internal/printers/tick.
 */
export default defineNitroPlugin(() => {
  if (!hasDatabaseConfig()) return
  if (process.env.PRINTER_RETARGET === '0') return

  setTimeout(() => {
    void (async () => {
      try {
        const { useDb } = await import('../db/client')
        const { retargetSavedQueues } = await import('../services/printers')
        await retargetSavedQueues(useDb())
      }
      catch (err) {
        console.warn('[printers] saved queues could not be checked', err instanceof Error ? err.message : err)
      }
    })()
  }, 1500)
})
