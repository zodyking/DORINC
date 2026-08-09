import { defineNitroPlugin } from 'nitropack/runtime'
import { hasDatabaseConfig } from '../services/runtime-config.service'

/**
 * Always poll Susan AI Administrator deletion reviews from the Nitro process.
 * Dedicated workers also process these jobs via deletion-ai-review.mjs; this
 * path covers deploys where EMBEDDED_WORKERS is off or WORKER_KIND is set only
 * on the web service.
 */
export default defineNitroPlugin(() => {
  if (!hasDatabaseConfig()) return
  if (process.env.AI_ADMINISTRATOR_WORKER === 'false') return

  const pollMs = Number(process.env.AI_ADMINISTRATOR_POLL_MS ?? 5000)
  let tickRunning = false

  const interval = setInterval(async () => {
    if (tickRunning) return
    tickRunning = true
    try {
      const { useDb } = await import('../db/client')
      const { processDeletionRequestAiReviews } = await import('../services/ai-administrator.service')
      const reviewed = await processDeletionRequestAiReviews(useDb())
      if (reviewed.processed || reviewed.failed) {
        console.log(
          `[ai-administrator-worker] deletion_request_ai_review processed=${reviewed.processed} failed=${reviewed.failed}`,
        )
      }
    }
    catch (err) {
      console.error('[ai-administrator-worker] tick failed', err)
    }
    finally {
      tickRunning = false
    }
  }, pollMs)

  console.log(`[ai-administrator-worker] started (poll ${pollMs}ms)`)

  const stop = () => clearInterval(interval)
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
})
