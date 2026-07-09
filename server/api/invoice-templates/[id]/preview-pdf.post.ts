import { setResponseHeader } from 'h3'
import { useDb } from '../../../db/client'
import {
  InvoiceTemplatesServiceError,
  previewTemplatePdf,
} from '../../../services/invoice-templates.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { previewTemplatePdfSchema } from '../../../../shared/validators/invoice-templates'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'templates.read.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, previewTemplatePdfSchema)

  try {
    const { pdf } = await previewTemplatePdf(useDb(), id, body.htmlContent)

    setResponseHeader(event, 'Content-Type', 'application/pdf')
    setResponseHeader(event, 'Content-Disposition', 'inline; filename="template-preview.pdf"')
    setResponseHeader(event, 'Cache-Control', 'no-store')
    return pdf
  }
  catch (err) {
    if (err instanceof InvoiceTemplatesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice template not found')
      if (err.code === 'NO_PREVIEW_INVOICE') {
        throw apiError(event, 'CONFLICT', 'No finalized invoice available for preview')
      }
    }
    const message = err instanceof Error ? err.message : 'PDF preview failed'
    throw apiError(event, 'INTERNAL', message)
  }
})
