import { useDb } from '../../../../../db/client'
import { writeAudit } from '../../../../../services/audit.service'
import {
  AiFeaturesServiceError,
  enqueueInvoiceDescription,
} from '../../../../../services/ai-features.service'
import { InvoicesServiceError } from '../../../../../services/invoices.service'
import { apiError } from '../../../../../utils/api-error'
import { rateLimitKeyFromUser, requireRateLimit } from '../../../../../utils/require-rate-limit'
import { requireEditSession } from '../../../../../utils/require-edit-session'
import { requirePermission } from '../../../../../utils/require-permission'
import { validateParams } from '../../../../../utils/validate'
import { invoiceLineParamSchema } from '../../../../../../shared/validators/invoices'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'ai.describe.all')
  requirePermission(event, 'invoices.update.all')
  await requireRateLimit(event, 'ai', rateLimitKeyFromUser(actor.id))

  const { id, lineId } = validateParams(event, invoiceLineParamSchema)
  const db = useDb()
  await requireEditSession(event, db, 'invoice', id, actor.id)

  try {
    const { aiJob, workerJob } = await enqueueInvoiceDescription(db, id, lineId, actor.id)

    await writeAudit(event, {
      entityType: 'invoice',
      entityId: id,
      action: 'ai.description.queued',
      afterData: { aiJobId: aiJob.id, workerJobId: workerJob.id, lineItemId: lineId },
      permissionKey: 'ai.describe.all',
    })

    return { aiJob, workerJob }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice not found')
      if (err.code === 'NOT_EDITABLE') throw apiError(event, 'CONFLICT', 'Paid and void invoices cannot be edited')
      if (err.code === 'LINE_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Line item not found')
    }
    if (err instanceof AiFeaturesServiceError) {
      if (err.code === 'NOT_CONFIGURED') throw apiError(event, 'CONFLICT', 'AI is not configured')
      if (err.code === 'FEATURE_DISABLED') throw apiError(event, 'CONFLICT', err.message)
      if (err.code === 'LINE_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Line item not found')
    }
    throw err
  }
})
