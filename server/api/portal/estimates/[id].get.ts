import {
  EstimatesServiceError,
  getPortalEstimateDetail,
} from '../../../services/estimates.service'
import { useDb } from '../../../db/client'
import { apiError } from '../../../utils/api-error'
import { requirePortalCustomer } from '../../../utils/require-portal'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const user = requirePortalCustomer(event)
  const { id } = validateParams(event, idParamSchema)

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
