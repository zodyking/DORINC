import { useDb } from '../../../db/client'
import {
  InvoiceTemplatesServiceError,
  previewTemplateHtml,
} from '../../../services/invoice-templates.service'
import { apiError } from '../../../utils/api-error'
import { throwPdfRenderApiError } from '../../../utils/pdf-api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { previewTemplateHtmlSchema } from '../../../../shared/validators/invoice-templates'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'templates.read.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, previewTemplateHtmlSchema)

  try {
    const { html } = await previewTemplateHtml(useDb(), id, body.bladeSource)

    setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
    setResponseHeader(event, 'Cache-Control', 'no-store')
    return html
  }
  catch (err) {
    if (err instanceof InvoiceTemplatesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice template not found')
      if (err.code === 'NO_PREVIEW_INVOICE') {
        throw apiError(event, 'CONFLICT', 'No finalized invoice available for preview')
      }
    }
    throwPdfRenderApiError(event, err)
  }
})
