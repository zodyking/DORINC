import { z } from 'zod'
import { useDb } from '../../../db/client'
import {
  getCloudflareAccountId,
  getCloudflareApiToken,
  getVultrApiKey,
} from '../../../services/billing-integrations.service'
import { testCloudflareConnection } from '../../../services/cloudflare-billing.service'
import { testVultrConnection } from '../../../services/vultr-billing.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { apiError } from '../../../utils/api-error'

const testSchema = z.object({
  provider: z.enum(['vultr', 'cloudflare']).default('vultr'),
  vultrApiKey: z.string().trim().min(8).max(512).optional(),
  cloudflareApiToken: z.string().trim().min(8).max(512).optional(),
  cloudflareAccountId: z.string().trim().min(8).max(64).optional(),
})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const body = await validateBody(event, testSchema)
  const db = useDb()

  try {
    if (body.provider === 'cloudflare') {
      const apiToken = body.cloudflareApiToken?.trim() || await getCloudflareApiToken(db)
      const accountId = body.cloudflareAccountId?.trim() || await getCloudflareAccountId(db)
      if (!apiToken) throw apiError(event, 'VALIDATION_ERROR', 'Cloudflare API token is required')
      if (!accountId) throw apiError(event, 'VALIDATION_ERROR', 'Cloudflare account ID is required')
      const result = await testCloudflareConnection(apiToken, accountId)
      return {
        ok: true,
        message: `Cloudflare connection verified (${result.domainCount} domain${result.domainCount === 1 ? '' : 's'})`,
      }
    }

    const apiKey = body.vultrApiKey?.trim() || await getVultrApiKey(db)
    if (!apiKey) throw apiError(event, 'VALIDATION_ERROR', 'Vultr API key is required')
    const result = await testVultrConnection(apiKey)
    return {
      ok: true,
      message: `Vultr connection verified (${result.instanceCount} instance${result.instanceCount === 1 ? '' : 's'})`,
    }
  }
  catch (e) {
    if (e && typeof e === 'object' && 'statusCode' in e) throw e
    throw apiError(event, 'INTERNAL_ERROR', (e as Error).message || 'Connection test failed')
  }
})
