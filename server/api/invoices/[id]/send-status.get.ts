import { useDb } from '../../../db/client'
import { getInvoiceSendDeliveryStatus } from '../../../services/invoice-send.service'
import { getInvoice, InvoicesServiceError } from '../../../services/invoices.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'invoices.send.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    const invoice = await getInvoice(db, id)
    const delivery = await getInvoiceSendDeliveryStatus(db, id)
    return { status: invoice.status, delivery }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Invoice not found')
    }
    throw err
  }
})
