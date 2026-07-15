import { AiProviderServiceError, getDecryptedApiKey, listOpenRouterModels } from '../../../services/ai-provider.service'
import { useDb } from '../../../db/client'
import { requirePermission } from '../../../utils/require-permission'
import { apiError } from '../../../utils/api-error'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'ai.admin.all')
  const query = getQuery(event)
  const overrideKey = typeof query.apiKey === 'string' ? query.apiKey : undefined

  try {
    let apiKey = overrideKey?.trim()
    if (!apiKey) {
      apiKey = await getDecryptedApiKey(useDb()) ?? undefined
    }
    const models = await listOpenRouterModels(apiKey)
    return { ok: true, count: models.length, models }
  }
  catch (err) {
    if (err instanceof AiProviderServiceError) {
      throw apiError(event, 'UPSTREAM_ERROR', err.message)
    }
    throw err
  }
})
