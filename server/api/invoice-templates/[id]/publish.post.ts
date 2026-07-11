import { useDb } from '../../../db/client'
import {
  InvoiceTemplatesServiceError,
  publishInvoiceTemplateVersion,
} from '../../../services/invoice-templates.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { publishInvoiceTemplateSchema } from '../../../../shared/validators/invoice-templates'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'templates.manage.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, publishInvoiceTemplateSchema)

  try {
    const version = await publishInvoiceTemplateVersion(useDb(), id, body, actor.id)

    await writeAudit(event, {
      entityType: 'invoice_template',
      entityId: id,
      action: 'templates.publish',
      afterData: {
        versionId: version.id,
        versionNumber: version.versionNumber,
        pageSize: version.designSettings.pageSize,
        accentColor: version.designSettings.accentColor,
        logoFileId: version.designSettings.logoFileId ?? null,
        hasCustomBlade: Boolean(version.bladeSource),
        bladeSourceLength: version.bladeSource?.length ?? 0,
      },
      permissionKey: 'templates.manage.all',
      riskLevel: 'sensitive',
    })

    return { version }
  }
  catch (err) {
    if (err instanceof InvoiceTemplatesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice template not found')
      if (err.code === 'NO_VERSION') throw apiError(event, 'CONFLICT', 'Template has no versions to publish from')
    }
    throw err
  }
})
