import { useDb } from '../../../db/client'
import { writeAudit } from '../../../services/audit.service'
import {
  generateInvoicePdf,
  InvoicePdfServiceError,
} from '../../../services/invoice-pdf.service'
import { apiError } from '../../../utils/api-error'
import { rateLimitKeyFromUser, requireRateLimit } from '../../../utils/require-rate-limit'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.generate_pdf.all')
  await requireRateLimit(event, 'pdf_gen', rateLimitKeyFromUser(actor.id))
  const { id } = validateParams(event, idParamSchema)

  try {
    const result = await generateInvoicePdf(useDb(), id, actor.id)

    await writeAudit(event, {
      entityType: 'invoice',
      entityId: id,
      action: result.alreadyExists ? 'invoices.generate_pdf.existing' : 'invoices.generate_pdf',
      afterData: {
        templateVersionId: result.templateVersionId,
        jobId: result.job?.id ?? null,
        invoiceFileId: result.invoiceFile?.id ?? null,
        alreadyExists: result.alreadyExists,
        jobStatus: result.job?.status ?? null,
      },
      permissionKey: 'invoices.generate_pdf.all',
      riskLevel: 'sensitive',
    })

    return {
      job: result.job,
      invoiceFile: result.invoiceFile,
      alreadyExists: result.alreadyExists,
      templateVersionId: result.templateVersionId,
    }
  }
  catch (err) {
    if (err instanceof InvoicePdfServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice not found')
      if (err.code === 'NOT_FINALIZED') {
        throw apiError(event, 'CONFLICT', 'Official PDFs can only be generated for approved, sent, or paid invoices')
      }
      if (err.code === 'TEMPLATE_NOT_FOUND') {
        throw apiError(event, 'INTERNAL_ERROR', 'No published invoice template is configured')
      }
    }
    throw err
  }
})
