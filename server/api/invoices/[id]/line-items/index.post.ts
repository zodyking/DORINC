import { useDb } from '../../../../db/client'
import { addInvoiceLineItem, InvoicesServiceError } from '../../../../services/invoices.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'
import { invoiceLineCreateSchema } from '../../../../../shared/validators/invoices'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.update.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, invoiceLineCreateSchema)

  try {
    const line = await addInvoiceLineItem(useDb(), id, body, actor.id)

    await writeAudit(event, {
      entityType: 'invoice',
      entityId: id,
      action: 'invoices.line_items.create',
      afterData: {
        lineId: line.id,
        lineType: line.lineType,
        description: line.description,
        lineAmount: line.lineAmount,
      },
      permissionKey: 'invoices.update.all',
    })

    return { line }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice not found')
      if (err.code === 'NOT_EDITABLE') throw apiError(event, 'CONFLICT', 'Only draft invoices can be edited')
      if (err.code === 'CATALOG_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Catalog item not found')
    }
    throw err
  }
})
