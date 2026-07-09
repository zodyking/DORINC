import { useDb } from '../../../db/client'
import {
  InvoiceTemplatesServiceError,
  duplicateInvoiceTemplate,
} from '../../../services/invoice-templates.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { duplicateInvoiceTemplateSchema } from '../../../../shared/validators/invoice-templates'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'templates.manage.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, duplicateInvoiceTemplateSchema)

  try {
    const detail = await duplicateInvoiceTemplate(useDb(), id, actor.id, body.name)

    await writeAudit(event, {
      entityType: 'invoice_template',
      entityId: detail!.template.id,
      action: 'templates.duplicate',
      afterData: {
        sourceTemplateId: id,
        name: detail!.template.name,
        slug: detail!.template.slug,
      },
      permissionKey: 'templates.manage.all',
      riskLevel: 'normal',
    })

    return detail
  }
  catch (err) {
    if (err instanceof InvoiceTemplatesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Invoice template not found')
    }
    throw err
  }
})
