import { useDb } from '../../db/client'
import { createCustomer } from '../../services/customers.service'
import { writeAudit } from '../../services/audit.service'
import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { customerCreateSchema } from '../../../shared/validators/customers'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'customers.create.all')
  const body = await validateBody(event, customerCreateSchema)

  const customer = await createCustomer(useDb(), body, actor.id)

  await writeAudit(event, {
    entityType: 'customer',
    entityId: customer.id,
    action: 'customers.create',
    afterData: { displayName: customer.displayName, accountKind: customer.accountKind },
    permissionKey: 'customers.create.all',
  })

  return { customer }
})
