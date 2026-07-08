import { useDb } from '../../../../db/client'
import { addContact, CustomersServiceError } from '../../../../services/customers.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'
import { contactCreateSchema } from '../../../../../shared/validators/customers'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'customers.update.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, contactCreateSchema)

  try {
    const contact = await addContact(useDb(), id, body)

    await writeAudit(event, {
      entityType: 'customer',
      entityId: id,
      action: 'customers.contact_add',
      afterData: { contactId: contact.id, name: contact.name, isPrimary: contact.isPrimary },
      actor: { id: actor.id, accountType: actor.accountType },
      permissionKey: 'customers.update.all',
    })

    return { contact }
  }
  catch (err) {
    if (err instanceof CustomersServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Customer not found')
    }
    throw err
  }
})
