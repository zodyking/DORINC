import { z } from 'zod'
import { useDb } from '../../../../../db/client'
import { archiveContact, CustomersServiceError } from '../../../../../services/customers.service'
import { writeAudit } from '../../../../../services/audit.service'
import { apiError } from '../../../../../utils/api-error'
import { requirePermission } from '../../../../../utils/require-permission'
import { validateParams } from '../../../../../utils/validate'
import { uuidSchema } from '../../../../../../shared/validators/common'

const paramsSchema = z.object({ id: uuidSchema, contactId: uuidSchema })

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'customers.update.all')
  const { id, contactId } = validateParams(event, paramsSchema)

  try {
    const contact = await archiveContact(useDb(), id, contactId)

    await writeAudit(event, {
      entityType: 'customer',
      entityId: id,
      action: 'customers.contact_archive',
      afterData: { contactId, archivedAt: contact.archivedAt },
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
