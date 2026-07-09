import { useDb } from '../../../db/client'
import { writeAudit } from '../../../services/audit.service'
import { InvoicesServiceError, transitionInvoice } from '../../../services/invoices.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.void.all')
  requirePermission(event, 'deletion_requests.review.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    const { invoice, before } = await transitionInvoice(useDb(), id, 'void', actor.id)

    await writeAudit(event, {
      entityType: 'invoice',
      entityId: id,
      action: 'invoices.void',
      beforeData: { status: before.status, total: before.total },
      afterData: { status: invoice.status, total: invoice.total },
      changedFields: ['status'],
      permissionKey: 'invoices.void.all',
      riskLevel: 'sensitive',
    })

    return { invoice }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice not found')
      if (err.code === 'INVALID_TRANSITION') {
        throw apiError(event, 'CONFLICT', 'This invoice cannot be voided in its current state')
      }
    }
    throw err
  }
})
