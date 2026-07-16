import { createInvoiceChangeRequest, PortalServiceError } from '../../../services/portal.service'
import { useDb } from '../../../db/client'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePortalCustomer } from '../../../utils/require-portal'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { portalInvoiceChangeRequestSchema } from '../../../../shared/validators/portal'

export default defineEventHandler(async (event) => {
  const user = requirePortalCustomer(event)
  requirePermission(event, 'portal.requests.own')
  const body = validateBody(event, portalInvoiceChangeRequestSchema)

  try {
    const request = await createInvoiceChangeRequest(useDb(), user.customerId, user.id, body)

    await writeAudit(event, {
      entityType: 'invoice_change_request',
      entityId: request.id,
      action: 'portal.invoice_change_request.create',
      afterData: {
        invoiceId: request.invoiceId,
        topic: request.topic,
        status: request.status,
      },
      permissionKey: 'portal.requests.own',
    })

    return {
      id: request.id,
      status: request.status,
      createdAt: request.createdAt,
    }
  }
  catch (err) {
    if (err instanceof PortalServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Customer not found')
      if (err.code === 'PORTAL_DISABLED') throw apiError(event, 'FORBIDDEN', 'Portal access is disabled')
      if (err.code === 'INVALID_INVOICE') throw apiError(event, 'VALIDATION_ERROR', 'Invoice not found')
      if (err.code === 'INVALID_LINE_ITEM') throw apiError(event, 'VALIDATION_ERROR', 'Line item not found on this invoice')
      if (err.code === 'NO_VEHICLE') throw apiError(event, 'VALIDATION_ERROR', 'This invoice has no vehicle information to correct')
    }
    throw err
  }
})
