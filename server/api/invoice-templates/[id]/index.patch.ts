import { useDb } from '../../../db/client'
import {
  InvoiceTemplatesServiceError,
  patchInvoiceTemplate,
} from '../../../services/invoice-templates.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { patchInvoiceTemplateSchema } from '../../../../shared/validators/invoice-templates'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'templates.manage.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, patchInvoiceTemplateSchema)

  try {
    const template = await patchInvoiceTemplate(useDb(), id, body)

    await writeAudit(event, {
      entityType: 'invoice_template',
      entityId: id,
      action: body.isDefault ? 'templates.set_default' : 'templates.renamed',
      afterData: { name: template?.name, slug: template?.slug, isDefault: template?.isDefault },
      permissionKey: 'templates.manage.all',
      riskLevel: 'normal',
    })

    return { template }
  }
  catch (err) {
    if (err instanceof InvoiceTemplatesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Invoice template not found')
    }
    throw err
  }
})
