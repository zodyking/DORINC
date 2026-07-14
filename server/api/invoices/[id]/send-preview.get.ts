import { useDb } from '../../../db/client'
import { getInvoiceSendPreview, InvoiceSendServiceError } from '../../../services/invoice-send.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'invoices.send.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    return await getInvoiceSendPreview(useDb(), id)
  }
  catch (err) {
    if (err instanceof InvoiceSendServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Invoice not found')
    }
    throw err
  }
})
