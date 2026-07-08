import { useDb } from '../../../db/client'
import { InvoicesServiceError, markInvoicePaid } from '../../../services/invoices.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { invoiceMarkPaidSchema } from '../../../../shared/validators/invoices'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.record_payment.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, invoiceMarkPaidSchema)

  try {
    const { invoice, before } = await markInvoicePaid(useDb(), id, actor.id, {
      amountPaid: body.amountPaid,
      paidAt: body.paidAt ? new Date(body.paidAt) : undefined,
    })

    await writeAudit(event, {
      entityType: 'invoice',
      entityId: id,
      action: 'invoices.mark_paid',
      beforeData: { status: before.status, amountPaid: before.amountPaid, balanceDue: before.balanceDue },
      afterData: {
        status: invoice.status,
        amountPaid: invoice.amountPaid,
        balanceDue: invoice.balanceDue,
        paidAt: invoice.paidAt,
      },
      changedFields: ['status', 'amountPaid', 'balanceDue', 'paidAt'],
      permissionKey: 'invoices.record_payment.all',
      riskLevel: 'sensitive',
    })

    return { invoice }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice not found')
      if (err.code === 'INVALID_TRANSITION') {
        throw apiError(event, 'CONFLICT', 'This invoice cannot be marked paid from its current status')
      }
    }
    throw err
  }
})
