import { useDb } from '../../../db/client'
import { InvoicesServiceError, markInvoicePaid } from '../../../services/invoices.service'
import { getCustomer } from '../../../services/customers.service'
import { resolveCustomerDisplayName } from '../../../services/entity-snapshots'
import { postInvoicePaymentReceivedTeamMessage } from '../../../services/workflow-chat.service'
import { subtractMoney } from '../../../../shared/money'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { invoiceMarkPaidSchema } from '../../../../shared/validators/invoices'

const METHOD_LABELS: Record<string, string> = {
  ach: 'ACH',
  check: 'Check',
  cash: 'Cash',
  credit_card: 'Credit card',
  wire: 'Wire',
}

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.record_payment.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, invoiceMarkPaidSchema)

  try {
    const db = useDb()
    const { invoice, before } = await markInvoicePaid(db, id, actor.id, {
      paymentAmount: body.paymentAmount,
      amountPaid: body.amountPaid,
      paidAt: body.paidAt ? new Date(`${body.paidAt}T12:00:00`) : undefined,
    })

    const paymentAmount = body.paymentAmount
      ?? (body.amountPaid ? subtractMoney(body.amountPaid, before.amountPaid ?? '0') : before.balanceDue ?? '0')

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

    void postInvoicePaymentReceivedTeamMessage(db, {
      senderUserId: actor.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName,
      paymentAmount,
      paidInFull: invoice.status === 'paid',
    }).catch(() => {})

    const changedFields = ['amountPaid', 'balanceDue']
    if (invoice.status !== before.status) changedFields.push('status')
    if (invoice.paidAt && !before.paidAt) changedFields.push('paidAt')

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
        paymentAmount: body.paymentAmount ?? body.amountPaid,
        method: body.method ? (METHOD_LABELS[body.method] ?? body.method) : undefined,
        reference: body.reference ?? undefined,
        notes: body.notes ?? undefined,
      },
      changedFields,
      permissionKey: 'invoices.record_payment.all',
      riskLevel: 'sensitive',
    })

    return { invoice }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice not found')
      if (err.code === 'INVALID_TRANSITION') {
        throw apiError(event, 'CONFLICT', 'Only sent invoices with an open balance can receive payments')
      }
      if (err.code === 'OVERPAYMENT') {
        throw apiError(event, 'VALIDATION_ERROR', 'Payment amount exceeds the open balance')
      }
      if (err.code === 'INVALID_PAYMENT') {
        throw apiError(event, 'VALIDATION_ERROR', 'Payment amount must be greater than zero')
      }
    }
    throw err
  }
})
