import { useDb } from '../../../../db/client'
import { getVultrApiKey } from '../../../../services/billing-integrations.service'
import { fetchVultrInstances } from '../../../../services/vultr-billing.service'
import { requirePermission } from '../../../../utils/require-permission'
import { apiError } from '../../../../utils/api-error'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const apiKey = await getVultrApiKey(useDb())
  if (!apiKey) throw apiError(event, 'VALIDATION_ERROR', 'Save a Vultr API key first')
  const instances = await fetchVultrInstances(apiKey)
  return { instances }
})
