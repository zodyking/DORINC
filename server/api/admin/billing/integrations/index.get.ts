import { useDb } from '../../../../db/client'
import { getBillingIntegrations } from '../../../../services/billing-integrations.service'
import { requirePermission } from '../../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const settings = await getBillingIntegrations(useDb())
  return { settings }
})
