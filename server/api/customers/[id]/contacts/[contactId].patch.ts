import { z } from 'zod'
import { useDb } from '../../../../db/client'
import { CustomersServiceError, updateContact } from '../../../../services/customers.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { uuidSchema } from '../../../../../shared/validators/common'
import { contactUpdateSchema } from '../../../../../shared/validators/customers'

const paramsSchema = z.object({ id: uuidSchema, contactId: uuidSchema })

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'customers.update.all')
  const { id, contactId } = validateParams(event, paramsSchema)
  const body = await validateBody(event, contactUpdateSchema)

  try {
    const { contact, before } = await updateContact(useDb(), id, contactId, body)

    await writeAudit(event, {
      entityType: 'customer',
      entityId: id,
      action: 'customers.contact_update',
      beforeData: { name: before.name, isPrimary: before.isPrimary, isBilling: before.isBilling },
      afterData: { name: contact.name, isPrimary: contact.isPrimary, isBilling: contact.isBilling },
      actor: { id: actor.id, accountType: actor.accountType },
      permissionKey: 'customers.update.all',
    })

    return { contact }
  }
  catch (err) {
    if (err instanceof CustomersServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Contact not found')
    }
    throw err
  }
})
