import { useDb } from '../../../../db/client'
import { InvoicesServiceError, updateInvoiceLineItem } from '../../../../services/invoices.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requireEditSession } from '../../../../utils/require-edit-session'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { invoiceLineParamSchema, invoiceLineUpdateSchema } from '../../../../../shared/validators/invoices'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.update.all')
  const { id, lineId } = validateParams(event, invoiceLineParamSchema)
  const patch = await validateBody(event, invoiceLineUpdateSchema)

  const db = useDb()
  await requireEditSession(event, db, 'invoice', id, actor.id)

  try {
    const { line, changedFields, before } = await updateInvoiceLineItem(db, id, lineId, patch, actor.id)

    if (changedFields.length) {
      await writeAudit(event, {
        entityType: 'invoice',
        entityId: id,
        action: 'invoices.line_items.update',
        beforeData: {
          lineId,
          description: before.description,
          lineType: before.lineType,
          quantity: before.quantity,
          unitPrice: before.unitPrice,
          lineAmount: before.lineAmount,
        },
        afterData: {
          lineId,
          description: line.description,
          lineType: line.lineType,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineAmount: line.lineAmount,
        },
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
      if (err.code === 'NOT_EDITABLE') throw apiError(event, 'CONFLICT', 'Paid and void invoices cannot be edited')
      if (err.code === 'CATALOG_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Catalog item not found')
    }
    throw err
  }
})
