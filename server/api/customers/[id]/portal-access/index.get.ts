import { useDb } from '../../../../db/client'
import { CustomersServiceError } from '../../../../services/customers.service'
import {
  getPortalAccessSummary,
  PortalAccessServiceError,
} from '../../../../services/portal-access.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'

function mapPortalError(event: Parameters<typeof apiError>[0], err: PortalAccessServiceError) {
  switch (err.code) {
    case 'NOT_FOUND':
    case 'CONTACT_NOT_FOUND':
      throw apiError(event, 'NOT_FOUND', 'Customer or contact not found')
    case 'NO_EMAIL':
      throw apiError(event, 'VALIDATION_ERROR', 'A contact with an email address is required for portal access')
    case 'EMAIL_IN_USE':
      throw apiError(event, 'CONFLICT', 'That email is already linked to another customer portal account')
    default:
      throw err
  }
}

export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers.read.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    return await getPortalAccessSummary(useDb(), id)
  }
  catch (err) {
    if (err instanceof CustomersServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Customer not found')
    }
    if (err instanceof PortalAccessServiceError) mapPortalError(event, err)
    throw err
  }
})
