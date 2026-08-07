import { useDb } from '../../../db/client'
import { getAiJob } from '../../../services/ai-jobs.service'
import { apiError } from '../../../utils/api-error'
import { hasPermission, requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  if (!hasPermission(event, 'ai.describe.all') && !hasPermission(event, 'ai.extract.all')) {
    requirePermission(event, 'ai.extract.all')
  }
  const { id } = validateParams(event, paramsSchema)
  const job = await getAiJob(useDb(), id)
  if (!job) throw apiError(event, 'NOT_FOUND', 'AI job not found')
  return { job }
})
