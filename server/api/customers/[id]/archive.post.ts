import { useDb } from '../../../db/client'
import { archiveCustomer, CustomersServiceError } from '../../../services/customers.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'customers.archive.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    const customer = await archiveCustomer(useDb(), id)

    await writeAudit(event, {
      entityType: 'customer',
      entityId: id,
      action: 'customers.archive',
      afterData: { archivedAt: customer.archivedAt },
      actor: { id: actor.id, accountType: actor.accountType },
      permissionKey: 'customers.archive.all',
      riskLevel: 'sensitive',
    })

    return { customer }
  }
  catch (err) {
    if (err instanceof CustomersServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Customer not found')
      if (err.code === 'ALREADY_ARCHIVED') throw apiError(event, 'CONFLICT', 'Customer is already archived')
    }
    throw err
  }
})
