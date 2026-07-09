import { getPortalInvoiceDetail, PortalServiceError } from '../../../services/portal.service'
import { useDb } from '../../../db/client'
import { apiError } from '../../../utils/api-error'
import { requirePortalCustomer } from '../../../utils/require-portal'

export default defineEventHandler(async (event) => {
  const user = requirePortalCustomer(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw apiError(event, 'VALIDATION_ERROR', 'Invoice id is required')

  try {
    return await getPortalInvoiceDetail(useDb(), user.customerId, id)
  }
  catch (err) {
    if (err instanceof PortalServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Invoice not found')
    }
    if (err instanceof PortalServiceError && err.code === 'PORTAL_DISABLED') {
      throw apiError(event, 'FORBIDDEN', 'Portal access is disabled')
    }
    throw err
  }
})
