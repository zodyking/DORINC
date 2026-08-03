import { z } from 'zod'
import {
  AiProviderServiceError,
  listOpenRouterModels,
  resolveOpenRouterApiKey,
} from '../../../services/ai-provider.service'
import { useDb } from '../../../db/client'
import { requirePermission } from '../../../utils/require-permission'
import { apiError } from '../../../utils/api-error'
import { validateBody } from '../../../utils/validate'

const modelsRequestSchema = z.object({
  /** Optional — verifies account access; public catalog works without a key. */
  apiKey: z.string().trim().min(8).max(512).optional(),
})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'ai.admin.all')
  const body = await validateBody(event, modelsRequestSchema)

  try {
    const apiKey = await resolveOpenRouterApiKey(useDb(), body.apiKey)
    const models = await listOpenRouterModels(apiKey)
    return { ok: true, count: models.length, models }
  }
  catch (err) {
    if (err instanceof AiProviderServiceError) {
      throw apiError(event, 'UPSTREAM_ERROR', err.message)
    }
    throw apiError(event, 'INTERNAL_ERROR', `Failed to load OpenRouter models: ${(err as Error).message}`)
  }
})
