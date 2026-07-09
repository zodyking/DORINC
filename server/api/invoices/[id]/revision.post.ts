import { useDb } from '../../../db/client'
import { createInvoiceRevision, InvoicesServiceError } from '../../../services/invoices.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.create.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    const invoice = await createInvoiceRevision(useDb(), id, actor.id)

    await writeAudit(event, {
      entityType: 'invoice',
      entityId: invoice.id,
      action: 'invoices.revision',
      afterData: {
        invoiceNumber: invoice.invoiceNumber,
        sourceInvoiceId: id,
        status: invoice.status,
        creationSource: invoice.creationSource,
      },
      permissionKey: 'invoices.create.all',
      riskLevel: 'sensitive',
    })

    return { invoice }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice not found')
      if (err.code === 'INVALID_TRANSITION') {
        throw apiError(event, 'CONFLICT', 'A revision can only be created from an approved, sent, or paid invoice')
      }
    }
    throw err
  }
})
