import { z } from 'zod'
import {
  SmsTemplatesServiceError,
  previewSmsTemplate,
} from '../../../services/sms-templates.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'

const paramsSchema = z.object({ typeKey: z.string().min(1) })
const bodySchema = z.object({
  content: z.object({
    body: z.string().max(1600).optional(),
  }).optional(),
})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'templates.read.all')
  const { typeKey } = validateParams(event, paramsSchema)
  const body = await validateBody(event, bodySchema)
  try {
    return await previewSmsTemplate(typeKey, body.content ?? null)
  }
  catch (err) {
    if (err instanceof SmsTemplatesServiceError) {
      throw apiError(event, 'NOT_FOUND', 'SMS template not found')
    }
    throw err
  }
})
