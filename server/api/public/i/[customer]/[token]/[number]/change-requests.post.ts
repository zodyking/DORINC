import { useDb, hasDatabaseConfigured } from '../../../../../../db/client'
import { hasDatabaseConfig } from '../../../../../../services/runtime-config.service'
import { writeAudit } from '../../../../../../services/audit.service'
import { notifyCustomerChangeRequestSubmitted } from '../../../../../../services/staff-notifications.service'
import {
  createPublicInvoiceChangeRequest,
  PublicInvoiceServiceError,
  publicInvoiceAuditLabel,
  requirePublicInvoiceAccess,
} from '../../../../../../services/public-invoice.service'
import { getActiveCustomer } from '../../../../../../services/portal.service'
import { apiError } from '../../../../../../utils/api-error'
import { rateLimitKeyFromIp, requireRateLimit } from '../../../../../../utils/require-rate-limit'
import { validateBody, validateParams } from '../../../../../../utils/validate'
import {
  portalInvoiceChangeRequestSchema,
  publicInvoiceAccessParamSchema,
} from '../../../../../../../shared/validators/portal'

export default defineEventHandler(async (event) => {
  if (!hasDatabaseConfig() || !hasDatabaseConfigured()) {
    throw apiError(event, 'NOT_FOUND', 'Invoice not found')
  }

  await requireRateLimit(event, 'upload', rateLimitKeyFromIp(event, 'public-invoice-change'))

  const params = validateParams(event, publicInvoiceAccessParamSchema)
  const body = await validateBody(event, portalInvoiceChangeRequestSchema)

  try {
    const access = requirePublicInvoiceAccess(params)
    const db = useDb()
    const request = await createPublicInvoiceChangeRequest(db, access.invoiceNumber, access, body)
    const customer = await getActiveCustomer(db, request.customerId)

    await writeAudit(event, {
      entityType: 'invoice_change_request',
      entityId: request.id,
      action: 'public.invoice_change_request.create',
      afterData: {
        invoiceId: request.invoiceId,
        topic: request.topic,
        status: request.status,
        invoiceNumber: publicInvoiceAuditLabel(access.invoiceNumber),
      },
      actor: null,
    })

    void notifyCustomerChangeRequestSubmitted(db, {
      requestId: request.id,
      customerId: request.customerId,
      customerName: customer.displayName,
      requestKind: 'invoice_change',
      topic: request.topic,
      message: request.description,
      invoiceNumber: publicInvoiceAuditLabel(access.invoiceNumber),
    }).catch(() => {})

    return {
      id: request.id,
      status: request.status,
      createdAt: request.createdAt,
    }
  }
  catch (err) {
    if (err instanceof PublicInvoiceServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice not found')
      if (err.code === 'NO_VEHICLE') throw apiError(event, 'VALIDATION_ERROR', 'This invoice has no vehicle information to correct')
      if (err.code === 'INVALID_CORRECTION') throw apiError(event, 'VALIDATION_ERROR', 'Correction details are incomplete')
    }
    throw err
  }
})
