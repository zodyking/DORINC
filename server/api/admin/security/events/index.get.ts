import { useDb } from '../../../../db/client'
import { listAccessEvents } from '../../../../services/security/access-events.service'
import { requirePermission } from '../../../../utils/require-permission'
import { validateQuery } from '../../../../utils/validate'
import { securityEventQuerySchema } from '../../../../../shared/validators/security'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const query = validateQuery(event, securityEventQuerySchema)
  return listAccessEvents(useDb(), query)
})
