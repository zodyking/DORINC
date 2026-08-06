import { useDb } from '../../../db/client'
import { InvoicesServiceError, markInvoiceUnpaid } from '../../../services/invoices.service'
import { getCustomer } from '../../../services/customers.service'
import { resolveCustomerDisplayName } from '../../../services/entity-snapshots'
import { postInvoicePaymentStatusTeamMessage } from '../../../services/workflow-chat.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.record_payment.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    const db = useDb()
    const { invoice, before } = await markInvoiceUnpaid(db, id, actor.id)

    let customerName = 'Customer'
    if (invoice.customerId) {
      try {
        const customer = await getCustomer(db, invoice.customerId)
        customerName = customer.displayName
      }
      catch {
        customerName = resolveCustomerDisplayName(null, invoice.customerSnapshot)
      }
    }
    else if (invoice.customerSnapshot) {
      customerName = resolveCustomerDisplayName(null, invoice.customerSnapshot)
    }

    void postInvoicePaymentStatusTeamMessage(db, {
      senderUserId: actor.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName,
      status: 'unpaid',
    }).catch(() => {})

    await writeAudit(event, {
      entityType: 'invoice',
      entityId: id,
      action: 'invoices.mark_unpaid',
      beforeData: {
        status: before.status,
        amountPaid: before.amountPaid,
        balanceDue: before.balanceDue,
        paidAt: before.paidAt,
      },
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
        throw apiError(event, 'CONFLICT', 'Only paid or partially paid invoices can be marked unpaid')
      }
    }
    throw err
  }
})
