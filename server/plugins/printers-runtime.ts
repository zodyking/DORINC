import { defineNitroPlugin } from 'nitropack/runtime'
import { hasDatabaseConfig } from '../services/runtime-config.service'

const BOOT_RETRY_MS = 10_000
const KEEPALIVE_MS = 60_000

/**
 * Start every saved printer's Tailscale device on launch and keep it running.
 * Queue drain and IMAP polling run on the dedicated worker via
 * POST /api/internal/printers/tick.
 */
export default defineNitroPlugin((nitroApp) => {
  if (!hasDatabaseConfig()) return
  if (process.env.PRINTER_RETARGET === '0') return

  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  async function boot() {
    try {
      const { useDb } = await import('../db/client')
      const { retargetSavedQueues } = await import('../services/printers')
      await retargetSavedQueues(useDb())
      schedule(keepAlive, KEEPALIVE_MS)
    }
    catch (err) {
      console.warn('[printers] saved queues could not be started; retrying', err instanceof Error ? err.message : err)
      schedule(boot, BOOT_RETRY_MS)
    }
  }

  async function keepAlive() {
    try {
      const { useDb } = await import('../db/client')
      const { keepTailnetRunning } = await import('../services/printers')
      await keepTailnetRunning(useDb())
    }
    catch (err) {
      console.warn('[printers] tailnet keepalive failed', err instanceof Error ? err.message : err)
    }
    schedule(keepAlive, KEEPALIVE_MS)
  }

  function schedule(fn: () => Promise<void>, ms: number) {
    if (stopped) return
    timer = setTimeout(() => { void fn() }, ms)
    timer.unref?.()
  }

  schedule(boot, 1500)
  nitroApp.hooks.hook('close', () => {
    stopped = true
    if (timer) clearTimeout(timer)
  })
})
