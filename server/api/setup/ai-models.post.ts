import { z } from 'zod'
import { AiProviderServiceError, listOpenRouterModels } from '../../services/ai-provider.service'
import { apiError } from '../../utils/api-error'

const schema = z.object({
  /** Optional — public catalog works without a key; key verifies account access. */
  apiKey: z.string().trim().min(10).max(500).optional(),
})

export default defineEventHandler(async (event) => {
  const raw = await readBody(event).catch(() => ({}))
  const parsed = schema.safeParse(raw && typeof raw === 'object' ? raw : {})
  if (!parsed.success) {
    throw apiError(event, 'VALIDATION_ERROR', 'Invalid request', {
      issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    })
  }

  try {
    const models = await listOpenRouterModels(parsed.data.apiKey)
    return {
      ok: true,
      count: models.length,
      models,
    }
  }
  catch (err) {
    if (err instanceof AiProviderServiceError) {
      throw apiError(event, 'UPSTREAM_ERROR', err.message)
    }
    throw apiError(event, 'INTERNAL_ERROR', `Failed to load OpenRouter models: ${(err as Error).message}`)
  }
})
