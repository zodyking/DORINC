import { useDb } from '../../../db/client'
import { writeAudit } from '../../../services/audit.service'
import {
  InvoicePrintServiceError,
  notifyInvoicePrinted,
} from '../../../services/invoice-print.service'
import { apiError } from '../../../utils/api-error'
import { hasPermission, type AuthContext } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

/** Team chat (+ email) when an invoice is printed on this device. */
export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const canPrint = hasPermission(event, 'invoices.read.all')
    || hasPermission(event, 'invoices.generate_pdf.all')
    || hasPermission(event, 'staples.print.all')
  if (!canPrint) {
    throw apiError(event, 'FORBIDDEN', 'You do not have permission to print invoices')
  }

  const { id } = validateParams(event, idParamSchema)

  try {
    await notifyInvoicePrinted(useDb(), auth.user.id, id)
    await writeAudit(event, {
      entityType: 'invoice',
      entityId: id,
      action: 'invoices.print_device',
      afterData: { invoiceId: id },
      permissionKey: 'invoices.read.all',
      riskLevel: 'normal',
    })
    return { ok: true }
  }
  catch (err) {
    if (err instanceof InvoicePrintServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', err.message)
      throw apiError(event, 'INTERNAL_ERROR', err.message)
    }
    throw err
  }
})
