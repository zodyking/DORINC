import { z } from 'zod'
import { useDb } from '../../../db/client'
import {
  SmsTemplatesServiceError,
  getSmsTemplateDetail,
} from '../../../services/sms-templates.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'

const paramsSchema = z.object({ typeKey: z.string().min(1) })

export default defineEventHandler(async (event) => {
  requirePermission(event, 'templates.read.all')
  const { typeKey } = validateParams(event, paramsSchema)
  try {
    return await getSmsTemplateDetail(useDb(), typeKey)
  }
  catch (err) {
    if (err instanceof SmsTemplatesServiceError) {
      throw apiError(event, 'NOT_FOUND', 'SMS template not found')
    }
    throw err
  }
})
