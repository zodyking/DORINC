import { useDb } from '../../db/client'
import { searchEntitiesForMessage } from '../../services/messages.service'
import { requirePermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { entitySearchQuerySchema } from '../../../shared/validators/messages'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'messages.send.own')
  const query = validateQuery(event, entitySearchQuerySchema)

  return searchEntitiesForMessage(
    useDb(),
    '',
    query.type,
    query.q,
    query.page,
    query.pageSize,
  )
})
