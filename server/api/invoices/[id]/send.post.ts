import { useDb } from '../../../db/client'
import { InvoicesServiceError, sendInvoice } from '../../../services/invoices.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.send.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    const { invoice, before } = await sendInvoice(useDb(), id, actor.id)

    await writeAudit(event, {
      entityType: 'invoice',
      entityId: id,
      action: 'invoices.send',
      beforeData: { status: before.status },
      afterData: { status: invoice.status, sentAt: invoice.sentAt },
      changedFields: ['status', 'sentAt'],
      permissionKey: 'invoices.send.all',
      riskLevel: 'sensitive',
    })

    return { invoice }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice not found')
      if (err.code === 'INVALID_TRANSITION') {
        throw apiError(event, 'CONFLICT', 'This invoice cannot be sent from its current status')
      }
    }
    throw err
  }
})
