import { useDb } from '../../../db/client'
import { InvoicesServiceError, updateInvoiceDates } from '../../../services/invoices.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { invoiceDatesSchema } from '../../../../shared/validators/invoices'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.update.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, invoiceDatesSchema)

  try {
    const { invoice, before, changedFields } = await updateInvoiceDates(useDb(), id, body, actor.id)

    if (changedFields.length) {
      await writeAudit(event, {
        entityType: 'invoice',
        entityId: id,
        action: 'invoices.update_dates',
        beforeData: { invoiceDate: before.invoiceDate, dueDate: before.dueDate },
        afterData: {
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          reason: body.reason ?? null,
        },
        changedFields,
        permissionKey: 'invoices.update.all',
        riskLevel: before.status === 'draft' ? 'normal' : 'sensitive',
      })
    }

    return { invoice, changedFields }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice not found')
      if (err.code === 'NOT_EDITABLE') {
        throw apiError(event, 'CONFLICT', 'This invoice cannot be edited in its current state')
      }
    }
    throw err
  }
})
