import { useDb } from '../../db/client'
import { buildBillingDashboard } from '../../services/billing-dashboard.service'
import { requirePermission } from '../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'billing.read.all')
  const dashboard = await buildBillingDashboard(useDb())
  return { dashboard }
})
