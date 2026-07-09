import { useDb } from '../../../db/client'
import { CustomersServiceError } from '../../../services/customers.service'
import {
  listCredentialEmailHistory,
  PortalAccessServiceError,
} from '../../../services/portal-access.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers.read.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    const items = await listCredentialEmailHistory(useDb(), id)
    return { items }
  }
  catch (err) {
    if (err instanceof CustomersServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Customer not found')
    }
    if (err instanceof PortalAccessServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Customer not found')
    }
    throw err
  }
})
