import { useDb, hasDatabaseConfigured } from '../../../../../../db/client'
import { hasDatabaseConfig } from '../../../../../../services/runtime-config.service'
import { writeAudit } from '../../../../../../services/audit.service'
import { notifyCustomerServiceRequestSubmitted } from '../../../../../../services/staff-notifications.service'
import { resolveCustomerDisplayName } from '../../../../../../services/entity-snapshots'
import {
  createPublicInvoiceServiceRequest,
  PublicInvoiceServiceError,
  publicInvoiceAuditLabel,
  requirePublicInvoiceAccess,
} from '../../../../../../services/public-invoice.service'
import { apiError } from '../../../../../../utils/api-error'
import { rateLimitKeyFromIp, requireRateLimit } from '../../../../../../utils/require-rate-limit'
import { validateBody, validateParams } from '../../../../../../utils/validate'
import {
  publicInvoiceAccessParamSchema,
  publicInvoiceServiceRequestSchema,
} from '../../../../../../../shared/validators/portal'

export default defineEventHandler(async (event) => {
  if (!hasDatabaseConfig() || !hasDatabaseConfigured()) {
    throw apiError(event, 'NOT_FOUND', 'Invoice not found')
  }

  await requireRateLimit(event, 'upload', rateLimitKeyFromIp(event, 'public-invoice-service'))

  const params = validateParams(event, publicInvoiceAccessParamSchema)
  const body = await validateBody(event, publicInvoiceServiceRequestSchema)

  try {
    const access = requirePublicInvoiceAccess(params)
    const db = useDb()
    const log = await createPublicInvoiceServiceRequest(db, access.invoiceNumber, access, body)

    await writeAudit(event, {
      entityType: 'service_log',
      entityId: log.id,
      action: 'public.service_request.create',
      afterData: {
        logNumber: log.logNumber,
        vehicleId: log.vehicleId,
        workType: log.workType,
        status: log.status,
        customerRequested: log.customerRequested,
        invoiceNumber: publicInvoiceAuditLabel(access.invoiceNumber),
      },
      actor: null,
    })

    void notifyCustomerServiceRequestSubmitted(db, {
      logId: log.id,
      customerId: log.customerId!,
      customerName: resolveCustomerDisplayName(null, log.customerSnapshot),
      vehicleSnapshot: log.vehicleSnapshot,
      serviceCategory: body.serviceCategory,
      urgency: body.urgency,
      message: body.description.trim(),
    }).catch(() => {})

    return {
      id: log.id,
      logNumber: log.logNumber,
      status: log.status,
      createdAt: log.createdAt,
    }
  }
  catch (err) {
    if (err instanceof PublicInvoiceServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice not found')
      if (err.code === 'NO_VEHICLE') throw apiError(event, 'VALIDATION_ERROR', 'This invoice has no vehicle to request service for')
    }
    throw err
  }
})
