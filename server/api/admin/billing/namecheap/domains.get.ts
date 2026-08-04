import { useDb } from '../../../../db/client'
import { getNamecheapCredentials } from '../../../../services/billing-integrations.service'
import { fetchNamecheapDomains } from '../../../../services/namecheap-billing.service'
import { requirePermission } from '../../../../utils/require-permission'
import { apiError } from '../../../../utils/api-error'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const creds = await getNamecheapCredentials(useDb())
  if (!creds) throw apiError(event, 'VALIDATION_ERROR', 'Save Namecheap credentials first')
  const domains = await fetchNamecheapDomains(creds)
  return { domains }
})
