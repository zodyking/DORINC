import { useDb } from '../../../db/client'
import {
  convertServiceLogToInvoice,
  getServiceLog,
  ServiceLogsServiceError,
} from '../../../services/service-logs.service'
import { InvoicesServiceError } from '../../../services/invoices.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { canSendServiceLogToInvoice } from '../../../utils/service-log-actions'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { serviceLogConvertToInvoiceSchema } from '../../../../shared/validators/service-logs'
import type { AuthContext } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, serviceLogConvertToInvoiceSchema)
  const db = useDb()

  try {
    const existing = await getServiceLog(db, id)
    if (!canSendServiceLogToInvoice(event, existing)) {
      throw apiError(event, 'FORBIDDEN', 'You do not have permission to send this service log to invoice')
    }

    const { invoice, log, before } = await convertServiceLogToInvoice(db, id, auth.user.id, {
      invoiceDate: body.invoiceDate,
    })

    const permissionKey = auth.user.id === existing.submittedBy
      ? 'service_logs.convert.own'
      : 'service_logs.convert.all'

    await writeAudit(event, {
      entityType: 'invoice',
      entityId: invoice.id,
      action: 'invoices.create',
      afterData: {
        invoiceNumber: invoice.invoiceNumber,
        creationSource: invoice.creationSource,
        customerId: invoice.customerId,
        vehicleId: invoice.vehicleId,
        serviceLogId: invoice.serviceLogId,
        status: invoice.status,
      },
      permissionKey,
      riskLevel: 'sensitive',
    })

    await writeAudit(event, {
      entityType: 'service_log',
      entityId: id,
      action: 'service_logs.convert_to_invoice',
      beforeData: { status: before.status, invoiceId: before.invoiceId },
      afterData: { status: log.status, invoiceId: log.invoiceId },
      changedFields: ['status', 'invoiceId'],
      permissionKey,
      riskLevel: 'sensitive',
    })

    return { invoice, log }
  }
  catch (err) {
    if (err instanceof ServiceLogsServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Service log not found')
      if (err.code === 'INVALID_TRANSITION') {
        throw apiError(event, 'CONFLICT', 'This service log cannot be sent to invoice yet')
      }
      if (err.code === 'ALREADY_CONVERTED') {
        throw apiError(event, 'CONFLICT', 'This service log has already been sent to invoice')
      }
    }
    if (err instanceof InvoicesServiceError) {
      if (err.code === 'CUSTOMER_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Customer not found')
      if (err.code === 'VEHICLE_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Vehicle not found')
      if (err.code === 'SERVICE_LOG_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Service log not found')
      if (err.code === 'INVALID_CREATE') {
        throw apiError(event, 'VALIDATION_ERROR', 'Unable to create invoice from this service log')
      }
    }
    console.error('[convert-to-invoice]', id, err)
    throw apiError(event, 'INTERNAL_ERROR', 'Unable to send this service log to invoice')
  }
})
