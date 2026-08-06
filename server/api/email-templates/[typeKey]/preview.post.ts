import { z } from 'zod'
import { useDb } from '../../../db/client'
import {
  EmailTemplatesServiceError,
  previewEmailTemplate,
} from '../../../services/email-templates.service'
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
  }).optional(),
}).optional().default({})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'templates.read.all')
  const { typeKey } = validateParams(event, paramsSchema)
  const body = await validateBody(event, bodySchema)

  try {
    return await previewEmailTemplate(useDb(), typeKey, body.content)
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
