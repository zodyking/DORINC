import { useDb } from '../../../../db/client'
import { deleteInvoiceLineItem, InvoicesServiceError } from '../../../../services/invoices.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requireEditSession } from '../../../../utils/require-edit-session'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { invoiceLineParamSchema } from '../../../../../shared/validators/invoices'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.update.all')
  const { id, lineId } = validateParams(event, invoiceLineParamSchema)

  const db = useDb()
  await requireEditSession(event, db, 'invoice', id, actor.id)

  try {
    const { deleted } = await deleteInvoiceLineItem(db, id, lineId, actor.id)

    await writeAudit(event, {
      entityType: 'invoice',
      entityId: id,
      action: 'invoices.line_items.delete',
      beforeData: {
        lineId,
        description: deleted.description,
        lineType: deleted.lineType,
        quantity: deleted.quantity,
        unitPrice: deleted.unitPrice,
        lineAmount: deleted.lineAmount,
      },
      permissionKey: 'invoices.update.all',
    })

    return { ok: true }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice not found')
      if (err.code === 'LINE_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Line item not found')
      if (err.code === 'NOT_EDITABLE') throw apiError(event, 'CONFLICT', 'Only draft invoices can be edited')
    }
    throw err
  }
})
