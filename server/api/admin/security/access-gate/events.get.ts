import { z } from 'zod'
import { useDb } from '../../../../db/client'
import { listAccessEvents } from '../../../../services/access-gate.service'
import { requirePermission } from '../../../../utils/require-permission'
import { validateQuery } from '../../../../utils/validate'

const querySchema = z.object({
  type: z.enum(['visit', 'login']).optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const { type, limit } = validateQuery(event, querySchema)
  const items = await listAccessEvents(useDb(), { eventType: type, limit })
  return { items }
})
