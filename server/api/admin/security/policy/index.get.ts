import { useDb } from '../../../../db/client'
import { readSecurityPolicy } from '../../../../services/security/policy.service'
import { requirePermission } from '../../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  return { policy: await readSecurityPolicy(useDb()) }
})
