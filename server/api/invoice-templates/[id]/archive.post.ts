import { useDb } from '../../../db/client'
import {
  InvoiceTemplatesServiceError,
  archiveInvoiceTemplate,
} from '../../../services/invoice-templates.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'templates.manage.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    const template = await archiveInvoiceTemplate(useDb(), id)

    await writeAudit(event, {
      entityType: 'invoice_template',
      entityId: id,
      action: 'templates.archive',
      afterData: { name: template?.name, slug: template?.slug },
      permissionKey: 'templates.manage.all',
      riskLevel: 'sensitive',
    })

    return { template }
  }
  catch (err) {
    if (err instanceof InvoiceTemplatesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice template not found')
      if (err.code === 'CANNOT_ARCHIVE_DEFAULT') {
        throw apiError(event, 'CONFLICT', 'Cannot archive the default template — set another default first')
      }
    }
    throw err
  }
})
