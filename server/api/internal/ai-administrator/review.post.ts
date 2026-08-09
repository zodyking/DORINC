import { useDb } from '../../../db/client'
import { reviewDeletionRequestWithSusan } from '../../../services/ai-administrator.service'
import { apiError } from '../../../utils/api-error'
import { z } from 'zod'

const bodySchema = z.object({
  requestId: z.string().uuid(),
})

/**
 * Worker-facing endpoint so the plain Node general worker can run Susan reviews
 * without loading the TypeScript service graph (tsx stack overflow risk).
 */
export default defineEventHandler(async (event) => {
  const expected = (process.env.INTERNAL_WORKER_TOKEN || process.env.ENCRYPTION_MASTER_KEY || '').trim()
  const provided = String(getHeader(event, 'x-worker-token') || '').trim()
  if (!expected || !provided || provided !== expected) {
    throw apiError(event, 'FORBIDDEN', 'Invalid worker token')
  }

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw apiError(event, 'VALIDATION_ERROR', 'requestId is required')
  }

  try {
    const result = await reviewDeletionRequestWithSusan(useDb(), parsed.data.requestId)
    return { ok: true, ...result }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'AI administrator review failed'
    throw apiError(event, 'INTERNAL_ERROR', message)
  }
})
