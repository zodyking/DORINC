import { z } from 'zod'
import { useDb } from '../../../db/client'
import { getInvoice, InvoicesServiceError } from '../../../services/invoices.service'
import {
  linkServiceLogToExistingInvoice,
  ServiceLogsServiceError,
} from '../../../services/service-logs.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema, uuidSchema } from '../../../../shared/validators/common'

const bodySchema = z.object({
  serviceLogId: uuidSchema,
})

/**
 * Bind a service log to an invoice draft and mark it converted.
 * Used after invoice-wizard phone/desktop upload when the draft is saved after photos.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'invoices.create.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, bodySchema)
  const db = useDb()

  try {
    await getInvoice(db, id)
    const log = await linkServiceLogToExistingInvoice(db, body.serviceLogId, id)

    await writeAudit(event, {
      entityType: 'service_log',
      entityId: body.serviceLogId,
      action: 'service_logs.convert_to_invoice',
      afterData: { status: log.status, invoiceId: log.invoiceId },
      changedFields: ['status', 'invoiceId'],
      permissionKey: 'invoices.create.all',
      riskLevel: 'sensitive',
    }).catch(() => {})

    return {
      log: {
        id: log.id,
        status: log.status,
        invoiceId: log.invoiceId,
        logNumber: log.logNumber,
      },
      invoiceId: id,
    }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Invoice not found')
    }
    if (err instanceof ServiceLogsServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Service log not found')
      if (err.code === 'ALREADY_CONVERTED') {
        throw apiError(event, 'CONFLICT', 'This service log is already linked to another invoice')
      }
      if (err.code === 'INVALID_TRANSITION') {
        throw apiError(event, 'CONFLICT', 'This service log cannot be attached to the invoice yet')
      }
    }
    throw err
  }
})
