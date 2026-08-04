import { z } from 'zod'
import { useDb } from '../../../db/client'
import {
  getNamecheapCredentials,
  getOpenrouterManagementKey,
  getVultrApiKey,
} from '../../../services/billing-integrations.service'
import { testNamecheapConnection } from '../../../services/namecheap-billing.service'
import { testOpenRouterManagementKey } from '../../../services/openrouter-billing.service'
import { testVultrConnection } from '../../../services/vultr-billing.service'
import { writeAudit } from '../../../services/audit.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { apiError } from '../../../utils/api-error'

const testSchema = z.object({
  provider: z.enum(['vultr', 'namecheap', 'openrouter']).default('vultr'),
  vultrApiKey: z.string().trim().min(8).max(512).optional(),
  namecheapApiUser: z.string().trim().min(1).max(120).optional(),
  namecheapUsername: z.string().trim().min(1).max(120).optional(),
  namecheapClientIp: z.string().trim().min(7).max(45).optional(),
  namecheapApiKey: z.string().trim().min(8).max(512).optional(),
  namecheapUseSandbox: z.boolean().optional(),
  openrouterManagementKey: z.string().trim().min(8).max(512).optional(),
})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const body = await validateBody(event, testSchema)
  const db = useDb()

  try {
    if (body.provider === 'vultr') {
      const apiKey = body.vultrApiKey?.trim() || await getVultrApiKey(db)
      if (!apiKey) throw apiError(event, 'VALIDATION_ERROR', 'Vultr API key is required')
      const result = await testVultrConnection(apiKey)
      await writeAudit(event, {
        entityType: 'billing_integrations',
        action: 'billing.vultr.connection.tested',
        afterData: { ok: true, instanceCount: result.instanceCount },
        permissionKey: 'system.admin.all',
        riskLevel: 'sensitive',
      })
      return {
        ok: true,
        message: `Vultr connection verified (${result.instanceCount} instance${result.instanceCount === 1 ? '' : 's'})`,
      }
    }

    if (body.provider === 'namecheap') {
      const saved = await getNamecheapCredentials(db)
      const creds = {
        apiUser: body.namecheapApiUser?.trim() || saved?.apiUser || '',
        username: body.namecheapUsername?.trim() || saved?.username || '',
        clientIp: body.namecheapClientIp?.trim() || saved?.clientIp || '',
        apiKey: body.namecheapApiKey?.trim() || saved?.apiKey || '',
        useSandbox: body.namecheapUseSandbox ?? saved?.useSandbox ?? false,
      }
      if (!creds.apiUser || !creds.username || !creds.clientIp || !creds.apiKey) {
        throw apiError(event, 'VALIDATION_ERROR', 'Namecheap API user, username, client IP, and API key are required')
      }
      const result = await testNamecheapConnection(creds)
      await writeAudit(event, {
        entityType: 'billing_integrations',
        action: 'billing.namecheap.connection.tested',
        afterData: { ok: true, domainCount: result.domainCount },
        permissionKey: 'system.admin.all',
        riskLevel: 'sensitive',
      })
      return {
        ok: true,
        message: `Namecheap connection verified (${result.domainCount} domain${result.domainCount === 1 ? '' : 's'})`,
      }
    }

    const managementKey = body.openrouterManagementKey?.trim() || await getOpenrouterManagementKey(db)
    if (!managementKey) throw apiError(event, 'VALIDATION_ERROR', 'OpenRouter management key is required')
    await testOpenRouterManagementKey(managementKey)
    await writeAudit(event, {
      entityType: 'billing_integrations',
      action: 'billing.openrouter.connection.tested',
      afterData: { ok: true },
      permissionKey: 'system.admin.all',
      riskLevel: 'sensitive',
    })
    return { ok: true, message: 'OpenRouter management key verified' }
  }
  catch (e) {
    if (e && typeof e === 'object' && 'statusCode' in e) throw e
    throw apiError(event, 'INTERNAL_ERROR', (e as Error).message || 'Connection test failed')
  }
})
