import { decodeVin } from '../../services/vehicles.service'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { vinDecodeRequestSchema } from '../../../shared/validators/vehicles'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'vehicles.decode_vin.all')
  const { vin } = await validateBody(event, vinDecodeRequestSchema)

  let result
  try {
    result = await decodeVin(vin)
  }
  catch {
    // vPIC unreachable — surface a clear upstream error, never a 500
    throw apiError(event, 'UPSTREAM_ERROR', 'VIN decode service (NHTSA vPIC) is unreachable, try again later')
  }

  await writeAudit(event, {
    entityType: 'vehicle',
    entityId: null,
    action: 'vehicles.decode_vin',
    afterData: {
      vin: result.normalized.vin,
      year: result.normalized.year,
      make: result.normalized.make,
      model: result.normalized.model,
    },
    permissionKey: 'vehicles.decode_vin.all',
  })

  return result
})
