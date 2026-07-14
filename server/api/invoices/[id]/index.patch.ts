import { useDb } from '../../../db/client'
import { InvoicesServiceError, updateInvoiceDraft } from '../../../services/invoices.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requireEditSession } from '../../../utils/require-edit-session'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { invoiceUpdateSchema } from '../../../../shared/validators/invoices'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.update.all')
  const { id } = validateParams(event, idParamSchema)
  const patch = await validateBody(event, invoiceUpdateSchema)

  const db = useDb()
  await requireEditSession(event, db, 'invoice', id, actor.id)

  try {
    const { invoice, before, changedFields } = await updateInvoiceDraft(db, id, patch, actor.id)

    if (changedFields.length) {
      await writeAudit(event, {
        entityType: 'invoice',
        entityId: id,
        action: 'invoices.update',
        beforeData: Object.fromEntries(changedFields.map(f => [f, before[f as keyof typeof before]])),
        afterData: Object.fromEntries(changedFields.map(f => [f, invoice[f as keyof typeof invoice]])),
        changedFields,
        permissionKey: 'invoices.update.all',
      })
    }

    return { invoice, changedFields }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice not found')
      if (err.code === 'NOT_EDITABLE') {
        throw apiError(event, 'CONFLICT', 'Only draft invoices can be edited')
      }
      if (err.code === 'CUSTOMER_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Customer not found')
      if (err.code === 'VEHICLE_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Vehicle not found')
    }
    throw err
  }
})
