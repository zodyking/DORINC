import { useDb } from '../../../../db/client'
import { writeAudit } from '../../../../services/audit.service'
import {
  AiFeaturesServiceError,
  reviewInvoiceLineAudit,
} from '../../../../services/ai-features.service'
import { InvoicesServiceError, getInvoice } from '../../../../services/invoices.service'
import { apiError } from '../../../../utils/api-error'
import { requireEditSession } from '../../../../utils/require-edit-session'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'
import { invoiceLineAuditReviewSchema } from '../../../../../shared/validators/ai'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'ai.describe.all')
  requirePermission(event, 'invoices.update.all')

  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, invoiceLineAuditReviewSchema)
  const db = useDb()
  await requireEditSession(event, db, 'invoice', id, actor.id)

  try {
    await getInvoice(db, id)
    const suggestion = await reviewInvoiceLineAudit(db, body, actor.id)

    await writeAudit(event, {
      entityType: 'invoice',
      entityId: id,
      action: 'ai.line_audit.reviewed',
      afterData: {
        suggestionId: body.suggestionId,
        decisions: body.decisions,
        status: suggestion.status,
      },
      permissionKey: 'ai.describe.all',
    })

    return { suggestion }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Invoice not found')
    }
    if (err instanceof AiFeaturesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', err.message)
      if (err.code === 'NOT_PENDING') throw apiError(event, 'CONFLICT', err.message)
      if (err.code === 'INVALID_CONTENT') throw apiError(event, 'VALIDATION_ERROR', err.message)
    }
    throw err
  }
})
