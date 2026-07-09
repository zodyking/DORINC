import { listPortalInvoices, PortalServiceError } from '../../../services/portal.service'
import { useDb } from '../../../db/client'
import { apiError } from '../../../utils/api-error'
import { requirePortalCustomer } from '../../../utils/require-portal'

export default defineEventHandler(async (event) => {
  const user = requirePortalCustomer(event)

  try {
    const items = await listPortalInvoices(useDb(), user.customerId)
    return { items }
  }
  catch (err) {
    if (err instanceof PortalServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Customer not found')
      if (err.code === 'PORTAL_DISABLED') throw apiError(event, 'FORBIDDEN', 'Portal access is disabled')
    }
    throw err
  }
})
