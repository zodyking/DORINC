import { processMailJobs } from './mail.mjs'

/** Drain queued email_send jobs until the queue is empty or max rounds reached. */
export async function drainMailQueue(pool, batchSize = 20, maxRounds = 10) {
  let processed = 0
  let failed = 0
  for (let round = 0; round < maxRounds; round++) {
    const result = await processMailJobs(pool, batchSize)
    processed += result.processed
    failed += result.failed
    if (result.processed + result.failed === 0) break
  }
  return { processed, failed }
}
