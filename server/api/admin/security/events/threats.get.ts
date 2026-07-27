import { useDb } from '../../../../db/client'
import { listThreatGroups } from '../../../../services/security/access-events.service'
import { requirePermission } from '../../../../utils/require-permission'
import { validateQuery } from '../../../../utils/validate'
import { securityThreatQuerySchema } from '../../../../../shared/validators/security'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const query = validateQuery(event, securityThreatQuerySchema)
  return { items: await listThreatGroups(useDb(), query) }
})
