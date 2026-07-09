import { useDb } from '../../../db/client'
import {
  InvoiceTemplatesServiceError,
  setDefaultInvoiceTemplate,
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
  await validateBody(event, patchInvoiceTemplateSchema)

  try {
    const template = await setDefaultInvoiceTemplate(useDb(), id)

    await writeAudit(event, {
      entityType: 'invoice_template',
      entityId: id,
      action: 'templates.set_default',
      afterData: { name: template?.name, slug: template?.slug },
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
