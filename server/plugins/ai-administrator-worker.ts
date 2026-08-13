import { defineNitroPlugin } from 'nitropack/runtime'
import { hasDatabaseConfig } from '../services/runtime-config.service'

/**
 * Dedicated workers already process deletion_request_ai_review via
 * deletion-ai-review.mjs → POST /api/internal/ai-administrator/review.
 *
 * Do NOT poll from the web process by default. OpenRouter reviews (25s each)
 * on the login Postgres pool made sign-in/dashboard look down for everyone.
 * Set AI_ADMINISTRATOR_WORKER=true only on a host that is not serving /api/auth.
 */
export default defineNitroPlugin(() => {
  if (!hasDatabaseConfig()) return
  if (process.env.AI_ADMINISTRATOR_WORKER !== 'true') return

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
