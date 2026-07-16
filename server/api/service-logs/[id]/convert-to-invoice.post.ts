import { useDb } from '../../../db/client'
import {
  convertServiceLogToInvoice,
  ServiceLogsServiceError,
} from '../../../services/service-logs.service'
import { InvoicesServiceError } from '../../../services/invoices.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { serviceLogConvertToInvoiceSchema } from '../../../../shared/validators/service-logs'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'service_logs.convert.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, serviceLogConvertToInvoiceSchema)

  try {
    const { invoice, log, before } = await convertServiceLogToInvoice(useDb(), id, actor.id, {
      invoiceDate: body.invoiceDate,
    })

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
      permissionKey: 'service_logs.convert.all',
      riskLevel: 'sensitive',
    })

    await writeAudit(event, {
      entityType: 'service_log',
      entityId: id,
      action: 'service_logs.convert_to_invoice',
      beforeData: { status: before.status, invoiceId: before.invoiceId },
      afterData: { status: log.status, invoiceId: log.invoiceId },
      changedFields: ['status', 'invoiceId'],
      permissionKey: 'service_logs.convert.all',
      riskLevel: 'sensitive',
    })

    return { invoice, log }
  }
  catch (err) {
    if (err instanceof ServiceLogsServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Service log not found')
      if (err.code === 'INVALID_TRANSITION') {
        throw apiError(event, 'CONFLICT', 'Only service logs in review can be converted to an invoice')
      }
      if (err.code === 'ALREADY_CONVERTED') {
        throw apiError(event, 'CONFLICT', 'This service log has already been converted to an invoice')
      }
    }
    if (err instanceof InvoicesServiceError) {
      if (err.code === 'CUSTOMER_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Customer not found')
      if (err.code === 'VEHICLE_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Vehicle not found')
      if (err.code === 'INVALID_CREATE') {
        throw apiError(event, 'VALIDATION_ERROR', 'Unable to create invoice from this service log')
      }
    }
    throw err
  }
})
