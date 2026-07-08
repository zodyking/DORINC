import { useDb } from '../../db/client'
import { createInvoice, InvoicesServiceError } from '../../services/invoices.service'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { invoiceCreateSchema } from '../../../shared/validators/invoices'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.create.all')
  const body = await validateBody(event, invoiceCreateSchema)

  try {
    const invoice = await createInvoice(useDb(), body, actor.id)

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
      permissionKey: 'invoices.create.all',
    })

    return { invoice }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError) {
      if (err.code === 'CUSTOMER_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Customer not found')
      if (err.code === 'VEHICLE_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Vehicle not found')
      if (err.code === 'SERVICE_LOG_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Service log not found')
      if (err.code === 'SOURCE_NOT_FOUND' || err.code === 'NOT_FOUND') {
        throw apiError(event, 'NOT_FOUND', 'Source invoice not found')
      }
      if (err.code === 'INVALID_CREATE') {
        throw apiError(event, 'VALIDATION_ERROR', 'Missing required fields for this creation path')
      }
      if (err.code === 'INVALID_TRANSITION') {
        throw apiError(event, 'CONFLICT', 'A revision cannot be created from this invoice status')
      }
    }
    throw err
  }
})
