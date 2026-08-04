import { AiProviderServiceError, testAiConnection } from '../../../services/ai-provider.service'
import { requirePermission } from '../../../utils/require-permission'
import { useDb } from '../../../db/client'
import { validateBody } from '../../../utils/validate'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { z } from 'zod'

const testSchema = z.object({
  apiKey: z.string().trim().min(8).max(512).optional(),
}).default({})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'ai.admin.all')
  const body = await validateBody(event, testSchema)

  try {
    const result = await testAiConnection(useDb(), body.apiKey)

    await writeAudit(event, {
      entityType: 'ai_settings',
      action: 'ai.connection.tested',
      afterData: { ok: result.ok, modelCount: result.modelCount },
      permissionKey: 'ai.admin.all',
      riskLevel: 'sensitive',
    })

    return {
      ok: result.ok,
      modelCount: result.modelCount,
      message: body.apiKey
        ? `OpenRouter connection verified with the entered key (${result.modelCount} models available)`
        : `OpenRouter connection verified with the saved key (${result.modelCount} models available)`,
    }
  }
  catch (e) {
    if (e instanceof AiProviderServiceError) {
      throw apiError(event, e.code === 'NOT_CONFIGURED' ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', e.message)
    }
    throw e
  }
})
