import { z } from 'zod'
import { useDb } from '../../../db/client'
import {
  EmailTemplatesServiceError,
  getEmailTemplateDetail,
} from '../../../services/email-templates.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'

const paramsSchema = z.object({ typeKey: z.string().min(1) })

export default defineEventHandler(async (event) => {
  requirePermission(event, 'templates.read.all')
  const { typeKey } = validateParams(event, paramsSchema)

  try {
    return await getEmailTemplateDetail(useDb(), typeKey)
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
