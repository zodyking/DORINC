import { z } from 'zod'
import { useDb } from '../../../../db/client'
import { listAccessEvents } from '../../../../services/access-gate.service'
import { requirePermission } from '../../../../utils/require-permission'
import { validateQuery } from '../../../../utils/validate'

const querySchema = z.object({
  type: z.enum(['visit', 'login']).optional(),
  group: z.enum(['access_granted', 'fail', 'geofence_blocked', 'blocked']).optional(),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(['newest', 'oldest', 'outcome', 'type', 'user', 'ip']).optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
  /** Inclusive start ISO timestamp. */
  from: z.string().trim().min(10).max(40).optional(),
  /** Exclusive end ISO timestamp. */
  to: z.string().trim().min(10).max(40).optional(),
})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const { type, group, q, sort, limit, from, to } = validateQuery(event, querySchema)
  const items = await listAccessEvents(useDb(), {
    eventType: type,
    displayGroup: group,
    q: q || undefined,
    sort: sort || 'newest',
    limit,
    from: from ?? null,
    to: to ?? null,
  })
  return { items }
})
