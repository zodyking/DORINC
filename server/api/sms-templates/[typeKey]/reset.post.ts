import { z } from 'zod'
import { useDb } from '../../../db/client'
import {
  SmsTemplatesServiceError,
  resetSmsTemplate,
} from '../../../services/sms-templates.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'

const paramsSchema = z.object({ typeKey: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'templates.manage.all')
  const { typeKey } = validateParams(event, paramsSchema)
  try {
    const detail = await resetSmsTemplate(useDb(), typeKey, actor.id)
    await writeAudit(event, {
      entityType: 'sms_template',
      entityId: typeKey,
      action: 'sms_template.reset',
      permissionKey: 'templates.manage.all',
      riskLevel: 'sensitive',
    })
    return detail
  }
  catch (err) {
    if (err instanceof SmsTemplatesServiceError) {
      throw apiError(event, 'NOT_FOUND', 'SMS template not found')
    }
    throw err
  }
})
