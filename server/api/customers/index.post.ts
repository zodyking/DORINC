import { useDb } from '../../db/client'
import { createCustomer, CustomersServiceError } from '../../services/customers.service'
import { postCustomerCreatedTeamMessage } from '../../services/workflow-chat.service'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { customerCreateSchema } from '../../../shared/validators/customers'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'customers.create.all')
  const body = await validateBody(event, customerCreateSchema)

  try {
    const db = useDb()
    const customer = await createCustomer(db, body, actor.id)

    await writeAudit(event, {
      entityType: 'customer',
      entityId: customer.id,
      action: 'customers.create',
      afterData: { displayName: customer.displayName, accountKind: customer.accountKind },
      permissionKey: 'customers.create.all',
    })

    void postCustomerCreatedTeamMessage(db, {
      senderUserId: actor.id,
      customerId: customer.id,
      customerName: customer.displayName,
    }).catch(() => {})

    return { customer }
  }
  catch (err) {
    if (err instanceof CustomersServiceError && err.code === 'EMAIL_RESERVED_BY_STAFF') {
      throw apiError(event, 'CONFLICT', 'That email belongs to a staff account — use a different customer email')
    }
    throw err
  }
})
