import { useDb } from '../../db/client'
import { writeAudit } from '../../services/audit.service'
import {
  bulkQueueInvoiceSend,
  InvoiceSendServiceError,
} from '../../services/invoice-send.service'
import { apiError } from '../../utils/api-error'
import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { invoiceBulkSendSchema } from '../../../shared/validators/invoices'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.send.all')
  const body = await validateBody(event, invoiceBulkSendSchema)

  try {
    const { results, recipient } = await bulkQueueInvoiceSend(useDb(), body, actor.id)

    const queued = results.filter(r => r.queued).length
    const alreadyQueued = results.filter(r => r.alreadyQueued).length
    const failed = results.filter(r => r.error).length

    await writeAudit(event, {
      entityType: 'customer',
      entityId: body.customerId,
      action: 'invoices.bulk_send',
      afterData: {
        customerId: body.customerId,
        recipientEmail: recipient?.email ?? null,
        requested: body.invoiceIds.length,
        queued,
        alreadyQueued,
        failed,
        invoiceIds: body.invoiceIds,
      },
      permissionKey: 'invoices.send.all',
      riskLevel: 'sensitive',
    })

    return {
      results,
      recipient,
      summary: { requested: body.invoiceIds.length, queued, alreadyQueued, failed },
    }
  }
  catch (err) {
    if (err instanceof InvoiceSendServiceError) {
      throw apiError(event, 'VALIDATION_ERROR', err.message)
    }
    throw err
  }
})
