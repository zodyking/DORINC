import { decodeVin } from '../../../services/vehicles.service'
import { apiError } from '../../../utils/api-error'
import { requirePortalCustomer } from '../../../utils/require-portal'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { vinDecodeRequestSchema } from '../../../../shared/validators/vehicles'

export default defineEventHandler(async (event) => {
  requirePortalCustomer(event)
  requirePermission(event, 'portal.requests.own')
  const { vin } = await validateBody(event, vinDecodeRequestSchema)

  try {
    const { normalized } = await decodeVin(vin)
    return {
      normalized: {
        vin: normalized.vin,
        year: normalized.year,
        make: normalized.make,
        model: normalized.model,
      },
    }
  }
  catch {
    throw apiError(event, 'UPSTREAM_ERROR', 'Could not look up this VIN right now. Try again in a moment.')
  }
})
