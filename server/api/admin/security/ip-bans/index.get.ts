import { useDb } from '../../../../db/client'
import { listIpBans } from '../../../../services/security/ip-bans.service'
import { requirePermission } from '../../../../utils/require-permission'
import { validateQuery } from '../../../../utils/validate'
import { ipBanQuerySchema } from '../../../../../shared/validators/security-access'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const query = validateQuery(event, ipBanQuerySchema)
  return listIpBans(useDb(), query)
})
