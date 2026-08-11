import { z } from 'zod'
import { useDb } from '../../../db/client'
import {
  SmsTemplatesServiceError,
  saveSmsTemplate,
} from '../../../services/sms-templates.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'

const paramsSchema = z.object({ typeKey: z.string().min(1) })
const bodySchema = z.object({
  content: z.object({
    body: z.string().min(1).max(1600),
  }),
  activate: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'templates.manage.all')
  const { typeKey } = validateParams(event, paramsSchema)
  const body = await validateBody(event, bodySchema)

  try {
    const detail = await saveSmsTemplate(useDb(), typeKey, body, actor.id)
    await writeAudit(event, {
      entityType: 'sms_template',
      entityId: typeKey,
      action: 'sms_template.saved',
      afterData: { isActive: detail.isActive, activate: body.activate ?? null },
      permissionKey: 'templates.manage.all',
      riskLevel: 'sensitive',
    })
    return detail
  }
  catch (err) {
    if (err instanceof SmsTemplatesServiceError) {
      if (err.code === 'VALIDATION') {
        throw apiError(event, 'VALIDATION_ERROR', 'SMS body must be 1–1600 characters')
      }
      throw apiError(event, 'NOT_FOUND', 'SMS template not found')
    }
    throw err
  }
})
