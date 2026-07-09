import { useDb } from '../../../db/client'
import {
  InvoiceTemplatesServiceError,
  testRenderTemplatePdf,
} from '../../../services/invoice-templates.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { testTemplatePdfSchema } from '../../../../shared/validators/invoice-templates'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'templates.manage.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, testTemplatePdfSchema)

  try {
    const result = await testRenderTemplatePdf(useDb(), id, body.designSettings, actor.id)

    await writeAudit(event, {
      entityType: 'invoice_template',
      entityId: id,
      action: 'templates.test_pdf',
      afterData: {
        jobId: result.job.id,
        previewInvoiceId: result.previewInvoiceId,
      },
      permissionKey: 'templates.manage.all',
      riskLevel: 'normal',
    })

    return result
  }
  catch (err) {
    if (err instanceof InvoiceTemplatesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice template not found')
      if (err.code === 'NO_PREVIEW_INVOICE') {
        throw apiError(event, 'CONFLICT', 'No finalized invoice available for test render')
      }
    }
    throw err
  }
})
