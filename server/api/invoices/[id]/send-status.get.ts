import { useDb } from '../../../db/client'
import { advanceInvoiceSendPipeline } from '../../../services/invoice-send-pipeline.service'
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
    const delivery = await getInvoiceSendDeliveryStatus(db, id)

    if (delivery && (delivery.status === 'queued' || delivery.status === 'processing')) {
      try {
        await advanceInvoiceSendPipeline(id)
      }
      catch (err) {
        console.error('[send-status] inline pipeline advance failed', id, err)
      }
    }

    const refreshedDelivery = await getInvoiceSendDeliveryStatus(db, id)
    const refreshedInvoice = await getInvoice(db, id)
    return { status: refreshedInvoice.status, delivery: refreshedDelivery }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Invoice not found')
    }
    throw err
  }
})
