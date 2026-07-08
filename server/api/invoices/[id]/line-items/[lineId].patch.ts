import { useDb } from '../../../../db/client'
import { InvoicesServiceError, updateInvoiceLineItem } from '../../../../services/invoices.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { invoiceLineParamSchema, invoiceLineUpdateSchema } from '../../../../../shared/validators/invoices'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.update.all')
  const { id, lineId } = validateParams(event, invoiceLineParamSchema)
  const patch = await validateBody(event, invoiceLineUpdateSchema)

  try {
    const { line, changedFields } = await updateInvoiceLineItem(useDb(), id, lineId, patch, actor.id)

    if (changedFields.length) {
      await writeAudit(event, {
        entityType: 'invoice',
        entityId: id,
        action: 'invoices.line_items.update',
        afterData: { lineId, changedFields, lineAmount: line.lineAmount },
        changedFields,
        permissionKey: 'invoices.update.all',
      })
    }

    return { line, changedFields }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice not found')
      if (err.code === 'LINE_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Line item not found')
      if (err.code === 'NOT_EDITABLE') throw apiError(event, 'CONFLICT', 'Only draft invoices can be edited')
      if (err.code === 'CATALOG_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Catalog item not found')
    }
    throw err
  }
})
