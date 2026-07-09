import {
  EstimatesServiceError,
  getPortalEstimateDetail,
} from '../../../services/estimates.service'
import { useDb } from '../../../db/client'
import { apiError } from '../../../utils/api-error'
import { requirePortalCustomer } from '../../../utils/require-portal'

export default defineEventHandler(async (event) => {
  const user = requirePortalCustomer(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw apiError(event, 'VALIDATION_ERROR', 'Estimate id is required')

  try {
    return await getPortalEstimateDetail(useDb(), user.customerId, id)
  }
  catch (err) {
    if (err instanceof EstimatesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Estimate not found')
    }
    if (err instanceof EstimatesServiceError && err.code === 'PORTAL_DISABLED') {
      throw apiError(event, 'FORBIDDEN', 'Portal access is disabled')
    }
    throw err
  }
})
