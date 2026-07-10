import { setResponseHeader } from 'h3'
import { useDb } from '../../../db/client'
import {
  InvoicePdfServiceError,
  previewInvoicePdf,
} from '../../../services/invoice-pdf.service'
import { apiError } from '../../../utils/api-error'
import { throwPdfRenderApiError } from '../../../utils/pdf-api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

/** Live DomPDF preview for any invoice status — not stored as the official PDF. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'invoices.generate_pdf.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    const { pdf, filename } = await previewInvoicePdf(useDb(), id)

    setResponseHeader(event, 'Content-Type', 'application/pdf')
    setResponseHeader(event, 'Content-Disposition', `inline; filename="${filename}"`)
    setResponseHeader(event, 'Cache-Control', 'no-store')
    return pdf
  }
  catch (err) {
    if (err instanceof InvoicePdfServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice not found')
      if (err.code === 'TEMPLATE_NOT_FOUND') {
        throw apiError(event, 'INTERNAL_ERROR', 'No published invoice template is configured')
      }
    }
    throwPdfRenderApiError(event, err)
  }
})
