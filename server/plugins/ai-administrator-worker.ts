import { defineNitroPlugin } from 'nitropack/runtime'
import { hasDatabaseConfig } from '../services/runtime-config.service'

/**
 * Always poll Susan AI Administrator deletion reviews from the Nitro process.
 * Dedicated workers also process these jobs via deletion-ai-review.mjs; this
 * path covers deploys where EMBEDDED_WORKERS is off or WORKER_KIND is set only
 * on the web service.
 *
 * On start (and each tick) Susan also catch-up-enqueues any open pending
 * deletion requests that lack an active review job — so reviews survive
 * restarts and Control Panel setting changes.
 */
export default defineNitroPlugin(() => {
  if (!hasDatabaseConfig()) return
  if (process.env.AI_ADMINISTRATOR_WORKER === 'false') return

  const pollMs = Number(process.env.AI_ADMINISTRATOR_POLL_MS ?? 5000)
  let tickRunning = false

  async function tick(reason: 'startup' | 'poll') {
    if (tickRunning) return
    tickRunning = true
    try {
      const { useDb } = await import('../db/client')
      const {
        catchUpPendingDeletionRequestAiReviews,
        processDeletionRequestAiReviews,
      } = await import('../services/ai-administrator.service')
      const db = useDb()

      const catchUp = await catchUpPendingDeletionRequestAiReviews(db, {
        // Startup / settings-style wake: ignore cooldown. Poll uses cooldown to avoid spam.
        ignoreCooldown: reason === 'startup',
      })
      if (catchUp.enqueued) {
        console.log(
          `[ai-administrator-worker] ${reason} catch-up enqueued=${catchUp.enqueued} pending=${catchUp.pending}`,
        )
      }

      const reviewed = await processDeletionRequestAiReviews(db)
      if (reviewed.processed || reviewed.failed) {
        console.log(
          `[ai-administrator-worker] deletion_request_ai_review processed=${reviewed.processed} failed=${reviewed.failed}`,
        )
      }
    }
    catch (err) {
      console.error(`[ai-administrator-worker] ${reason} tick failed`, err)
    }
    finally {
      tickRunning = false
    }
  }

  // Startup catch-up after a short delay so migrations/DB are ready.
  const startupDelayMs = Number(process.env.AI_ADMINISTRATOR_STARTUP_DELAY_MS ?? 2500)
  const startupTimer = setTimeout(() => {
    void tick('startup')
  }, startupDelayMs)

  const interval = setInterval(() => {
    void tick('poll')
  }, pollMs)

  console.log(`[ai-administrator-worker] started (poll ${pollMs}ms, startup catch-up ${startupDelayMs}ms)`)

  const stop = () => {
    clearTimeout(startupTimer)
    clearInterval(interval)
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
})
