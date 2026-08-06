import { z } from 'zod'
import { useDb } from '../../../db/client'
import {
  EmailTemplatesServiceError,
  setEmailTemplateActive,
} from '../../../services/email-templates.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'

const paramsSchema = z.object({ typeKey: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'templates.manage.all')
  const { typeKey } = validateParams(event, paramsSchema)

  try {
    const detail = await setEmailTemplateActive(useDb(), typeKey, false, actor.id)
    await writeAudit(event, {
      entityType: 'email_template',
      entityId: typeKey,
      action: 'email_template.deactivated',
      afterData: { isActive: false },
      permissionKey: 'templates.manage.all',
      riskLevel: 'sensitive',
    })
    return detail
  }
  catch (err) {
    if (err instanceof EmailTemplatesServiceError) {
      if (err.code === 'INVALID_TYPE' || err.code === 'NOT_FOUND') {
        throw apiError(event, 'NOT_FOUND', 'Email template not found')
      }
    }
    throw err
  }
})
