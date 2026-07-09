import { useDb } from '../../../db/client'
import { writeAudit } from '../../../services/audit.service'
import {
  AiFeaturesServiceError,
  enqueueServiceLogExtraction,
} from '../../../services/ai-features.service'
import { getServiceLog, ServiceLogsServiceError } from '../../../services/service-logs.service'
import { apiError } from '../../../utils/api-error'
import { rateLimitKeyFromUser, requireRateLimit } from '../../../utils/require-rate-limit'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { serviceLogExtractRequestSchema } from '../../../../shared/validators/ai'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'ai.extract.all')
  requirePermission(event, 'service_logs.review.all')
  await requireRateLimit(event, 'ai', rateLimitKeyFromUser(actor.id))

  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, serviceLogExtractRequestSchema)
  const db = useDb()

  try {
    await getServiceLog(db, id)
    const { aiJob, workerJob } = await enqueueServiceLogExtraction(db, id, actor.id, body.fileId)

    await writeAudit(event, {
      entityType: 'service_log',
      entityId: id,
      action: 'ai.extraction.queued',
      afterData: { aiJobId: aiJob.id, workerJobId: workerJob.id, fileId: body.fileId ?? null },
      permissionKey: 'ai.extract.all',
      riskLevel: 'sensitive',
    })

    return { aiJob, workerJob }
  }
  catch (err) {
    if (err instanceof ServiceLogsServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Service log not found')
    }
    if (err instanceof AiFeaturesServiceError) {
      if (err.code === 'NOT_CONFIGURED') throw apiError(event, 'CONFLICT', 'AI is not configured')
      if (err.code === 'FEATURE_DISABLED') throw apiError(event, 'CONFLICT', err.message)
      if (err.code === 'NO_IMAGES') throw apiError(event, 'CONFLICT', 'No images available for extraction')
    }
    throw err
  }
})
