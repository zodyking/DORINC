import { z } from 'zod'
import { useDb } from '../../../db/client'
import {
  EmailTemplatesServiceError,
  saveEmailTemplate,
} from '../../../services/email-templates.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'

const paramsSchema = z.object({ typeKey: z.string().min(1) })
const bodySchema = z.object({
  content: z.object({
    subject: z.string().max(300),
    eyebrow: z.string().max(120),
    headline: z.string().max(200),
    lead: z.string().max(2000),
    noteTitle: z.string().max(200).optional().default(''),
    noteBody: z.string().max(4000).optional().default(''),
    primaryActionLabel: z.string().max(120).optional().default(''),
    htmlSource: z.string().max(250_000).optional().default(''),
  }),
  activate: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'templates.manage.all')
  const { typeKey } = validateParams(event, paramsSchema)
  const body = await validateBody(event, bodySchema)

  try {
    const detail = await saveEmailTemplate(useDb(), typeKey, body, actor.id)
    await writeAudit(event, {
      entityType: 'email_template',
      entityId: typeKey,
      action: 'email_template.saved',
      afterData: { isActive: detail.isActive, activate: body.activate ?? null },
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
