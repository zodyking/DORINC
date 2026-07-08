import { useDb } from '../../../db/client'
import { CustomersServiceError, updateCustomer } from '../../../services/customers.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { customerUpdateSchema } from '../../../../shared/validators/customers'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers.update.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, customerUpdateSchema)

  try {
    const { customer, before, changedFields } = await updateCustomer(useDb(), id, body)

    if (changedFields.length) {
      await writeAudit(event, {
        entityType: 'customer',
        entityId: id,
        action: 'customers.update',
        beforeData: Object.fromEntries(changedFields.map(f => [f, before[f as keyof typeof before]])),
        afterData: Object.fromEntries(changedFields.map(f => [f, customer[f as keyof typeof customer]])),
        changedFields,
        permissionKey: 'customers.update.all',
      })
    }

    return { customer }
  }
  catch (err) {
    if (err instanceof CustomersServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Customer not found')
    }
    throw err
  }
})
