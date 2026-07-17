import { defineNitroPlugin } from 'nitropack/runtime'
import { hasDatabaseConfig } from '../services/runtime-config.service'
import { usePool } from '../db/client'

function embeddedWorkersEnabled(): boolean {
  if (process.env.WORKER_KIND) return false
  if (process.env.EMBEDDED_WORKERS === 'false') return false
  return process.env.EMBEDDED_WORKERS === 'true' || process.env.NODE_ENV === 'production'
}

export default defineNitroPlugin(() => {
  if (!embeddedWorkersEnabled() || !hasDatabaseConfig()) return

  const pool = usePool()
  const pdfPollMs = Number(process.env.PDF_WORKER_POLL_MS ?? 3000)
  const generalPollMs = Number(process.env.WORKER_POLL_MS ?? 1500)
  const mailBatch = Number(process.env.MAIL_BATCH_SIZE ?? 20)

  let pdfTickRunning = false
  let generalTickRunning = false

  const pdfInterval = setInterval(async () => {
    if (pdfTickRunning) return
    pdfTickRunning = true
    try {
      const { runPdfWorkerTick } = await import('../lib/pdf-worker-tick.mjs')
      await runPdfWorkerTick(pool, { logPrefix: '[embedded-pdf-worker]' })
    }
    catch (err) {
      console.error('[embedded-pdf-worker] tick failed', err)
    }
    finally {
      pdfTickRunning = false
    }
  }, pdfPollMs)

  const generalInterval = setInterval(async () => {
    if (generalTickRunning) return
    generalTickRunning = true
    try {
      const { runGeneralWorkerTick } = await import('../lib/general-worker-tick.mjs')
      await runGeneralWorkerTick(pool, { mailBatch, logPrefix: '[embedded-worker]' })
    }
    catch (err) {
      console.error('[embedded-worker] tick failed', err)
    }
    finally {
      generalTickRunning = false
    }
  }, generalPollMs)

  console.log(`[embedded-workers] started (pdf ${pdfPollMs}ms, general ${generalPollMs}ms)`)

  const stop = () => {
    clearInterval(pdfInterval)
    clearInterval(generalInterval)
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
})
