import { z } from 'zod'
import { getPortalRequestDetail, PortalServiceError } from '../../../../services/portal.service'
import { useDb } from '../../../../db/client'
import { apiError } from '../../../../utils/api-error'
import { requirePortalCustomer } from '../../../../utils/require-portal'
import { validateParams } from '../../../../utils/validate'

const paramsSchema = z.object({
  kind: z.enum(['service', 'billing', 'vehicle_change', 'vehicle_add', 'general']),
  id: z.uuid(),
})

export default defineEventHandler(async (event) => {
  const user = requirePortalCustomer(event)
  const { kind, id } = validateParams(event, paramsSchema)

  try {
    const request = await getPortalRequestDetail(useDb(), user.customerId, kind, id)
    return request
  }
  catch (err) {
    if (err instanceof PortalServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Request not found')
      if (err.code === 'PORTAL_DISABLED') throw apiError(event, 'FORBIDDEN', 'Portal access is disabled')
    }
    throw err
  }
})
