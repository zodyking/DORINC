import { useDb } from '../../../db/client'
import { duplicateInvoice, InvoicesServiceError } from '../../../services/invoices.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.create.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    const invoice = await duplicateInvoice(useDb(), id, actor.id)

    await writeAudit(event, {
      entityType: 'invoice',
      entityId: invoice.id,
      action: 'invoices.duplicate',
      afterData: {
        invoiceNumber: invoice.invoiceNumber,
        sourceInvoiceId: id,
        status: invoice.status,
      },
      permissionKey: 'invoices.create.all',
    })

    return { invoice }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Invoice not found')
    }
    throw err
  }
})
