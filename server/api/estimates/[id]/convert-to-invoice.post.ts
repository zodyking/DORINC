import { useDb } from '../../../db/client'
import {
  convertEstimateToInvoice,
  EstimatesServiceError,
} from '../../../services/estimates.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { estimateConvertToInvoiceSchema } from '../../../../shared/validators/estimates'
import { formatInvoiceNumber } from '../../../db/schema/invoices'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'estimates.manage.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, estimateConvertToInvoiceSchema)

  try {
    const { invoice, estimate, before } = await convertEstimateToInvoice(useDb(), id, actor.id, {
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
        estimateId: estimate.id,
        status: invoice.status,
      },
      permissionKey: 'estimates.manage.all',
      riskLevel: 'sensitive',
    })

    await writeAudit(event, {
      entityType: 'estimate',
      entityId: id,
      action: 'estimates.convert_to_invoice',
      beforeData: { status: before.status, convertedInvoiceId: before.convertedInvoiceId },
      afterData: { status: estimate.status, convertedInvoiceId: estimate.convertedInvoiceId },
      changedFields: ['status', 'convertedInvoiceId', 'convertedAt'],
      permissionKey: 'estimates.manage.all',
      riskLevel: 'sensitive',
    })

    return {
      invoice: {
        ...invoice,
        invoiceNumberFormatted: formatInvoiceNumber(invoice.invoiceNumber),
      },
      estimate,
    }
  }
  catch (err) {
    if (err instanceof EstimatesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Estimate not found')
      if (err.code === 'INVALID_TRANSITION') {
        throw apiError(event, 'CONFLICT', 'Only customer-approved estimates can be converted')
      }
      if (err.code === 'ALREADY_CONVERTED') {
        throw apiError(event, 'CONFLICT', 'This estimate has already been converted')
      }
    }
    throw err
  }
})
