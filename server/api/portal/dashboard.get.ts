import { getPortalDashboard, PortalServiceError } from '../../services/portal.service'
import { useDb } from '../../db/client'
import { apiError } from '../../utils/api-error'
import { requirePortalCustomer } from '../../utils/require-portal'
import type { AuthContext } from '../../utils/require-permission'

export default defineEventHandler(async (event) => {
  const user = requirePortalCustomer(event)
  const auth = event.context.auth as AuthContext & { user: { name: string } }

  try {
    return await getPortalDashboard(useDb(), user.customerId, auth.user.name)
  }
  catch (err) {
    if (err instanceof PortalServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Customer not found')
      if (err.code === 'PORTAL_DISABLED') throw apiError(event, 'FORBIDDEN', 'Portal access is disabled')
    }
    throw err
  }
})
